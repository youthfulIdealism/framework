import * as z from "zod/v4";
import { Router, Request, Response, NextFunction } from "express";
import { isValidObjectId } from "mongoose";

import { F_Collection } from "./F_Collection.js";
import { F_Security_Model, Authenticated_Request } from "./F_Security_Models/F_Security_Model.js";
import { convert_null, query_object_to_mongodb_limits, query_object_to_mongodb_query } from "./utils/query_object_to_mongodb_query.js";
import { z_mongodb_id } from "./utils/mongoose_from_zod.js";
import { F_Collection_Registry } from "./F_Collection_Registry.js";
import { detect_malicious_keys } from "./utils/malicious_keys.js";

/*process.on('unhandledRejection', (reason, promise) => {
    console.log(`CAUGHT UNHANDLED REJECTION`)
    console.log(reason)
})*/

export function compile<Collection_ID extends string, ZodSchema extends z.ZodObject>(
    app: Router,
    collection: F_Collection<Collection_ID, ZodSchema>,
    api_prefix: string,
    collection_registry: F_Collection_Registry<any>){
    /*app.use((req, res, next) => {
        console.log(`${req.method} ${req.originalUrl}`)
        next();
    })*/

    let me_path = [api_prefix, 'me'].join('/');
    app.get(me_path, async (req: Request, res: Response) => { 
        let auth_data = await F_Security_Model.auth_fetcher(req);
        res.json(auth_data)
    });

    
    for(let access_layers of collection.access_layers){
        for(let layer of access_layers.layers){
            // verify that the collection is not in its own layers
            if(layer === collection.collection_id){
                throw new Error(`Error compiling collection ${collection.collection_id}: a collection cannot be a member of it's own layer. Remove "${collection.collection_id}" from the collection's layers.`)
            }

            // verify that each layer has a corresponding collection
            if(!collection_registry.collections[layer]){ 
                throw new Error(`Error compiling collection ${collection.collection_id}: collection registry does not have a collection with the ID "${layer}". Each layer must be a valid collection ID.`)
            }

            if(!Object.hasOwn(collection.validator._zod.def.shape, `${layer}_id`)) {
                throw new Error(`Error compiling collection ${collection.collection_id}: collection does not have a field "${layer}_id. Either remove ${layer} from the collection's layers, or add a field ${layer}_id`)
            }

            let layer_id_is_mongodb_id = collection.validator._zod.def.shape[`${layer}_id`].meta()?.framework_override_type === 'mongodb_id';
            if(!layer_id_is_mongodb_id){
                throw new Error(`Error compiling collection ${collection.collection_id}:  ${layer}_id must be a mongodb ID. use the z_mongodb_id, z_mongodb_id_nullable, or z_mongodb_id_optional special fields.`)
            }
        }
    }
    
    // set up the Express endpoints
    for(let access_layers of collection.access_layers){
        let base_layers_path_components = access_layers.layers.flatMap(ele => [ele, ':' + ele]);
        
        let get_one_path = [
            api_prefix,
            ...base_layers_path_components,
            `${collection.collection_id}/:document_id`
        ].join('/')

        


        //console.log(get_one_path);

        // get individual document
        app.get(get_one_path, async (req: Request, res: Response, next: NextFunction) => {
            try {
                // ensure the the document ID passed in is valid so that mongodb doesn't have a cow
                if (!isValidObjectId(req.params.document_id)) {
                    res.status(400);
                    res.json({ error: `${req.params.document_id} is not a valid document ID.` });
                    return;
                }

                let find = { '_id': req.params.document_id } as { [key: string]: any } 
                for(let layer of access_layers.layers){
                    find[`${layer}_id`] = req.params[layer];
                }

                let permissive_security_model = await F_Security_Model.model_with_permission(access_layers.security_models, req, res, find, 'get');
                if (!permissive_security_model) {
                    res.status(403);
                    res.json({ error: `You do not have permission to fetch documents from ${collection.collection_id}.` });
                    return;
                }

                let document;
                try {
                    document = await collection.mongoose_model.findOne(find, undefined, { 'lean': true });
                } catch(err){
                    res.status(500);
                    res.json({ error: `there was a novel error` });
                    console.error(err);
                    return;
                }
                
                if (!document) {
                    let sendable = await permissive_security_model.handle_empty_query_results(req, res, 'get');
                    res.json(sendable);
                } else {
                    //await req.schema.handle_pre_send(req, document);
                    res.json({ data: document });
                }
                //await req.schema.fire_api_event('get', req, [document]);
            } catch(err){
                console.error(err);
                return next(err);
            }
        })


        let get_multiple_path = [
            api_prefix,
            ...base_layers_path_components,
            collection.collection_id
        ].join('/')

        app.get(get_multiple_path, async (req: Request, res: Response) => {
            let validated_query_args: { [key: string]: any } ;
            try {
                validated_query_args = collection.query_validator_server.parse(convert_null(req.query));
            } catch(err){
                if(err instanceof z.ZodError){
                    res.status(400);
                    res.json({ error: err.issues });
                    return;
                } else {
                    console.error(err);
                    res.status(500);
                    res.json({ error: `there was a novel error` });
                    return;
                }
            }

            let find = query_object_to_mongodb_query(validated_query_args) as { [key: string]: any };
            for(let layer of access_layers.layers){
                find[`${layer}_id`] = req.params[layer];
            }

            let permissive_security_model = await F_Security_Model.model_with_permission(access_layers.security_models, req, res, find, 'get');
            if (!permissive_security_model) {
                res.status(403);
                res.json({ error: `You do not have permission to fetch documents from ${collection.collection_id}.` });
                return;
            }
           
            let documents;
            try {
                let query = collection.mongoose_model.find(find, undefined, { 'lean': true });
                if(validated_query_args.sort && validated_query_args.cursor) {
                    res.status(400);
                    res.json({ error: 'you cannot use both a cursor and a sort.' });
                    return;
                }
                let fetch = query_object_to_mongodb_limits(query, validated_query_args);
                documents = await fetch;
            } catch(err){
                if (err.name == 'CastError') {
                    res.status(400);
                    res.json({ error: 'one of the IDs you passed to the query was not a valid MongoDB object ID.' });
                    return;
                } else {
                    res.status(500);
                    res.send({error: 'there was a novel error'});
                    console.error(err);
                    return;
                }
            }

            if (!documents) {
                let sendable = await permissive_security_model.handle_empty_query_results(req, res, 'get');
                res.json(sendable);
            } else {
                //await req.schema.handle_pre_send(req, document);
                res.json({ data: documents });
            }
            //await req.schema.fire_api_event('get', req, [document]);
        })

        let put_path = [
            api_prefix,
            ...base_layers_path_components,
            `${collection.collection_id}/:document_id`
        ].join('/')

        app.put(put_path, async (req, res) => {
            if (!isValidObjectId(req.params.document_id)) {
                res.status(400);
                res.json({ error: `${req.params.document_id} is not a valid document ID.` });
                return;
            }

            if(req.body._id && req.body._id !== req.params.document_id){
                res.status(400);
                res.json({ error: `mismatch between document ID and request body _id` });
                return;
            }

            let find = { '_id': req.params.document_id } as { [key: string]: any } ;
            for(let layer of access_layers.layers){
                find[`${layer}_id`] = req.params[layer];
            }

            
            let permissive_security_model = await F_Security_Model.model_with_permission(access_layers.security_models, req, res, find, 'update');
            if (!permissive_security_model) {
                res.status(403);
                res.json({ error: `You do not have permission to fetch documents from ${collection.collection_id}.` });
                return;
            }

            if(collection.mongoose_schema.updated_by?.type === String) {
                // if the security schema required the user to be logged in, then req.auth.user_id will not be null
                if((req as Authenticated_Request).auth?.user_id){
                    req.body.updated_by = (req as Authenticated_Request).auth?.user_id;
                } else {
                    req.body.updated_by = null;
                }
            }

            if(collection.mongoose_schema.updated_at?.type === Date) {
                req.body.updated_at = new Date();
            }

            // TODO: it might be possible to build a validator that matches mongoDB's update
            // syntax to allow for targeted updating of nested stuff
            let validated_request_body;
            try {
                validated_request_body = await collection.put_validator.parse(req.body);
            } catch(err){
                 if(err instanceof z.ZodError){
                    res.status(400);
                    res.json({ error: err.issues });
                    return;
                } else {
                    console.error(err);
                    res.status(500);
                    res.json({ error: `there was a novel error` });
                    return;
                }
            }

            try {
                detect_malicious_keys(validated_request_body);
            } catch(err){
                res.status(403);
                res.json({ error: `Found an unacceptable JSON key in the request body.` });
                return;
            }

            // if you're accessing the document from /x/:x/y/:y, then you can't change x or y. Note that this does mean if you can access
            // the document from /x/:x, then you'd be able to change y.
            for(let layer of access_layers.layers){
                if(validated_request_body[`${layer}_id`] && validated_request_body[`${layer}_id`] !== req.params[layer]){
                    res.status(403);
                    res.json({ error: `The system does not support changing the ${layer}_id of the document with this endpoint.` });
                    return;
                }
            }
            
            
            let results;
            try {
                results = await collection.perform_update_and_side_effects(find, validated_request_body);
            } catch(err){
                res.status(500);
                res.json({ error: `there was a novel error` });
                console.error(err);
                return;
            }

            if (!results) {
                let sendable = await permissive_security_model.handle_empty_query_results(req, res, 'update');
                res.json(sendable);
            } else {
                res.json({ data: results });
            }
            //await req.schema.fire_api_event('update', req, results);
        });

        let post_path = [
            api_prefix,
            ...base_layers_path_components,
            `${collection.collection_id}`
        ].join('/')

        app.post(post_path, async (req, res) => {
            // I'd like to have a validator here. I think it might need to be a map or record validator?
            let permissive_security_model = await F_Security_Model.model_with_permission(access_layers.security_models, req, res, undefined, 'create');
            if (!permissive_security_model) {
                res.status(403);
                res.json({ error: `You do not have permission to fetch documents from ${collection.collection_id}.` });
                return;
            }

            if(collection.mongoose_schema.updated_by?.type === String) {
                // if the security schema required the user to be logged in, then req.auth.user_id will not be null
                if((req as Authenticated_Request).auth?.user_id){
                    req.body.updated_by = (req as Authenticated_Request).auth?.user_id;
                } else {
                    req.body.updated_by = null;
                }
            }

            if(collection.mongoose_schema.updated_at?.type === Date) {
                req.body.updated_at = new Date();
            }

            if(collection.mongoose_schema.created_by?.type === String) {
                // if the security schema required the user to be logged in, then req.auth.user_id will not be null
                if((req as Authenticated_Request).auth?.user_id){
                    req.body.created_by = (req as Authenticated_Request).auth?.user_id;
                } else {
                    req.body.created_by = null;
                }
            }

            if(collection.mongoose_schema.created_at?.type === Date) {
                req.body.created_at = new Date();
            }

            let validated_request_body;
            try {
                validated_request_body = await collection.post_validator.parse(req.body);
            } catch(err){
                 if(err instanceof z.ZodError){
                    res.status(400);
                    res.json({ error: err.issues });
                    return;
                } else {
                    console.error(err);
                    res.status(500);
                    res.json({ error: `there was a novel error` });
                    return;
                }
            }

            try {
                detect_malicious_keys(validated_request_body);
            } catch(err){
                res.status(403);
                res.json({ error: `Found an unacceptable JSON key in the request body.` });
                return;
            }

            // if you're accessing the document from /x/:x/y/:y, then you can't change x or y. Note that this does mean if you can access
            // the document from /x/:x, then you'd be able to change y.
            for(let layer of access_layers.layers){
                if(validated_request_body[`${layer}_id`] && validated_request_body[`${layer}_id`] !== req.params[layer]){
                    res.status(403);
                    res.json({ error: `The system does not support changing the ${layer}_id of the document with this endpoint.` });
                    return;
                }
            }

            let results;
            try {
                results = await collection.perform_create_and_side_effects(validated_request_body);
            } catch(err){
                res.status(500);
                res.json({ error: `there was a novel error` });
                console.error(err);
                return;
            }

            if (!results) {
                let sendable = await permissive_security_model.handle_empty_query_results(req, res, 'create');
                res.json(sendable);
            } else {
                res.json({ data: results });
            }
            //await req.schema.fire_api_event('create', req, results);
        });

        let delete_path = [
            api_prefix,
            ...base_layers_path_components,
            `${collection.collection_id}/:document_id`
        ].join('/')

        app.delete(delete_path, async (req, res) => {
            if (!isValidObjectId(req.params.document_id)) {
                res.status(400);
                res.json({ error: `${req.params.document_id} is not a valid document ID.` });
                return;
            }

            let find = { '_id': req.params.document_id } as { [key: string]: any } ;
            for(let layer of access_layers.layers){
                find[`${layer}_id`] = req.params[layer];
            }

            let permissive_security_model = await F_Security_Model.model_with_permission(access_layers.security_models, req, res, find, 'delete');
            if (!permissive_security_model) {
                res.status(403);
                res.json({ error: `You do not have permission to fetch documents from ${collection.collection_id}.` });
                return;
            }

            let results;
            try {
                results = await collection.perform_delete_and_side_effects(find);
            } catch(err){
                res.status(500);
                res.json({ error: `there was a novel error` });
                console.error(err);
                return;
            }

            if (!results) {
                let sendable = await permissive_security_model.handle_empty_query_results(req, res, 'delete');
                res.json(sendable);
            } else {
                res.json({ data: results });
            }
            // await req.schema.fire_api_event('delete', req, results);
        });

        //////////////////////////////////////////////////////////////////////////////////////////////////////////////
        ////////////////////////////////////////    operate on array children    /////////////////////////////////////
        //////////////////////////////////////////////////////////////////////////////////////////////////////////////

        for(let [array_child_path, array_child_validator] of collection.array_children_map.entries()){

            let post_validator = collection.array_children_post_map.get(array_child_path);

            let array_child_post_path = [
                api_prefix,
                ...base_layers_path_components,
                `${collection.collection_id}/:document_id`,
                array_child_path
            ].join('/');

            app.post(array_child_post_path, async (req, res) => {
                if (!isValidObjectId(req.params.document_id)) {
                    res.status(400);
                    res.json({ error: `${req.params.document_id} is not a valid document ID.` });
                    return;
                }

                let find = { '_id': req.params.document_id } as { [key: string]: any } ;
                for(let layer of access_layers.layers){
                    find[`${layer}_id`] = req.params[layer];
                }

                // I'd like to have a validator here. I think it might need to be a map or record validator?
                let permissive_security_model = await F_Security_Model.model_with_permission(access_layers.security_models, req, res, find, 'update');
                if (!permissive_security_model) {
                    res.status(403);
                    res.json({ error: `You do not have permission to update documents from ${collection.collection_id}.` });
                    return;
                }

                let metadata_updater: any = {};
                if(collection.mongoose_schema.updated_by?.type === String) {
                    // if the security schema required the user to be logged in, then req.auth.user_id will not be null
                    if((req as Authenticated_Request).auth?.user_id){
                        metadata_updater.updated_by = (req as Authenticated_Request).auth?.user_id;
                    } else {
                        metadata_updater.updated_by = null;
                    }
                }

                if(collection.mongoose_schema.updated_at?.type === Date) {
                    metadata_updater.updated_at = new Date();
                }

                let validated_request_body;
                try {
                    validated_request_body = await post_validator.parse(req.body);
                } catch(err){
                    if(err instanceof z.ZodError){
                        res.status(400);
                        res.json({ error: err.issues });
                        return;
                    } else {
                        console.error(err);
                        res.status(500);
                        res.json({ error: `there was a novel error` });
                        return;
                    }
                }

                try {
                    detect_malicious_keys(validated_request_body);
                } catch(err){
                    res.status(403);
                    res.json({ error: `Found an unacceptable JSON key in the request body.` });
                    return;
                }

                let results;
                try {
                    //array_child_path
                    results = await collection.perform_update_and_side_effects(find, {
                        $push: {
                            [array_child_path]: validated_request_body,
                        },
                        ...metadata_updater
                    });
                } catch(err){
                    res.status(500);
                    res.json({ error: `there was a novel error` });
                    console.error(err);
                    return;
                }

                if (!results) {
                    let sendable = await permissive_security_model.handle_empty_query_results(req, res, 'update');
                    res.json(sendable);
                } else {
                    res.json({ data: results });
                }
                //await req.schema.fire_api_event('update', req, results);
            });

            

            let array_child_put_path = [
                api_prefix,
                ...base_layers_path_components,
                `${collection.collection_id}/:document_id`,
                array_child_path,
                ':array_item_id'
            ].join('/')

            app.put(array_child_put_path, async (req, res) => {
                if (!isValidObjectId(req.params.document_id)) {
                    res.status(400);
                    res.json({ error: `${req.params.document_id} is not a valid document ID.` });
                    return;
                }

                if (!isValidObjectId(req.params.array_item_id)) {
                    res.status(400);
                    res.json({ error: `${req.params.array_item_id} is not a valid document ID.` });
                    return;
                }

                if(req.body._id && req.body._id !== req.params.array_item_id){
                    res.status(400);
                    res.json({ error: `cannot update element _id.` });
                    return;
                }

                let find = { '_id': req.params.document_id } as { [key: string]: any } ;
                for(let layer of access_layers.layers){
                    find[`${layer}_id`] = req.params[layer];
                }
                find[`${array_child_path}._id`] = req.params.array_item_id;

                // I'd like to have a validator here. I think it might need to be a map or record validator?
                let permissive_security_model = await F_Security_Model.model_with_permission(access_layers.security_models, req, res, find, 'update');
                if (!permissive_security_model) {
                    res.status(403);
                    res.json({ error: `You do not have permission to update documents from ${collection.collection_id}.` });
                    return;
                }

                let metadata_updater: any = {};
                if(collection.mongoose_schema.updated_by?.type === String) {
                    // if the security schema required the user to be logged in, then req.auth.user_id will not be null
                    if((req as Authenticated_Request).auth?.user_id){
                        metadata_updater.updated_by = (req as Authenticated_Request).auth?.user_id;
                    } else {
                        metadata_updater.updated_by = null;
                    }
                }

                if(collection.mongoose_schema.updated_at?.type === Date) {
                    metadata_updater.updated_at = new Date();
                }

                let validated_request_body;
                try {
                    validated_request_body = await array_child_validator.parse(req.body);
                } catch(err){
                    if(err instanceof z.ZodError){
                        res.status(400);
                        res.json({ error: err.issues });
                        return;
                    } else {
                        console.error(err);
                        res.status(500);
                        res.json({ error: `there was a novel error` });
                        return;
                    }
                }

                try {
                    detect_malicious_keys(validated_request_body);
                } catch(err){
                    res.status(403);
                    res.json({ error: `Found an unacceptable JSON key in the request body.` });
                    return;
                }

                let results;
                try {
                    //array_child_path
                    results = await collection.perform_update_and_side_effects(find, {
                        $set: {
                            [`${array_child_path}.$`]: validated_request_body,
                        },
                        ...metadata_updater
                    });
                } catch(err){
                    res.status(500);
                    res.json({ error: `there was a novel error` });
                    console.error(err);
                    return;
                }

                if (!results) {
                    let sendable = await permissive_security_model.handle_empty_query_results(req, res, 'update');
                    res.json(sendable);
                } else {
                    res.json({ data: results });
                }
                //await req.schema.fire_api_event('update', req, results);
            });

            let array_child_delete_path = [
                api_prefix,
                ...base_layers_path_components,
                `${collection.collection_id}/:document_id`,
                array_child_path,
                ':array_item_id'
            ].join('/')

            app.delete(array_child_delete_path, async (req, res) => {
                if (!isValidObjectId(req.params.document_id)) {
                    res.status(400);
                    res.json({ error: `${req.params.document_id} is not a valid document ID.` });
                    return;
                }

                if (!isValidObjectId(req.params.array_item_id)) {
                    res.status(400);
                    res.json({ error: `${req.params.array_item_id} is not a valid document ID.` });
                    return;
                }

                let find = { '_id': req.params.document_id } as { [key: string]: any } ;
                for(let layer of access_layers.layers){
                    find[`${layer}_id`] = req.params[layer];
                }

                // I'd like to have a validator here. I think it might need to be a map or record validator?
                let permissive_security_model = await F_Security_Model.model_with_permission(access_layers.security_models, req, res, find, 'update');
                if (!permissive_security_model) {
                    res.status(403);
                    res.json({ error: `You do not have permission to update documents from ${collection.collection_id}.` });
                    return;
                }

                let metadata_updater: any = {};
                if(collection.mongoose_schema.updated_by?.type === String) {
                    // if the security schema required the user to be logged in, then req.auth.user_id will not be null
                    if((req as Authenticated_Request).auth?.user_id){
                        metadata_updater.updated_by = (req as Authenticated_Request).auth?.user_id;
                    } else {
                        metadata_updater.updated_by = null;
                    }
                }

                if(collection.mongoose_schema.updated_at?.type === Date) {
                    metadata_updater.updated_at = new Date();
                }
                let results;
                try {
                    //array_child_path
                    results = await collection.perform_update_and_side_effects(find, {
                        $pull: {
                            [array_child_path]: {_id: req.params.array_item_id},
                        },
                        ...metadata_updater
                    });
                } catch(err){
                    res.status(500);
                    res.json({ error: `there was a novel error` });
                    console.error(err);
                    return;
                }

                if (!results) {
                    let sendable = await permissive_security_model.handle_empty_query_results(req, res, 'update');
                    res.json(sendable);
                } else {
                    res.json({ data: results });
                }
                //await req.schema.fire_api_event('update', req, results);
            });
        }





    }
}