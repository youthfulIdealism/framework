import * as z from "zod/v4";
import { Router, Request, Response, NextFunction } from "express";
import { isValidObjectId } from "mongoose";

import { F_Collection } from "./F_Collection.js";
import { F_Security_Model, Authenticated_Request } from "./F_Security_Models/F_Security_Model.js";
import { convert_null, query_object_to_mongodb_limits, query_object_to_mongodb_query } from "./utils/query_object_to_mongodb_query.js";
import { z_mongodb_id } from "./utils/mongoose_from_zod.js";
import { F_Collection_Registry } from "./F_Collection_Registry.js";

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

    // verify that each layer has a corresponding collection
    for(let access_layers of collection.access_layers){
        for(let layer of access_layers.layers){
            if(!collection_registry.collections[layer]){ 
                throw new Error(`Error compiling collection ${collection.collection_id}: collection registry does not have a collection with the ID "${layer}". Each layer must be a valid collection ID.`)
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
                    //@ts-expect-error
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
                //@ts-expect-error
                let query = collection.mongoose_model.find(find, undefined, { 'lean': true });
                let fetch = query_object_to_mongodb_limits(query, collection.query_validator_server);
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

            // if you're accessing the document from /x/:x/y/:y, then you can't change x or y. Note that this does mean if you can access
            // the document from /x/:x, then you'd be able to change y.
            for(let layer of access_layers.layers){
                if(validated_request_body[`${layer}_id`] && validated_request_body[`${layer}_id`] !== req.params[layer]){
                    res.status(403);
                    res.json({ error: `The system does not support changing the ${layer}_id of the document with this endpoint.` });
                    return;
                }
            }

            /*let { error: pre_save_error } = await req.schema.handle_pre_save(req, value);
            if (pre_save_error) {
                res.status(400);
                res.json({ error: pre_save_error.message });
                return;
            }*/
            
            
            let results;
            try {
                results = await collection.perform_update_and_side_effects(find, validated_request_body);
                //results = await collection.mongoose_model.findOneAndUpdate(find, validated_request_body, { returnDocument: 'after', lean: true });
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

            // if you're accessing the document from /x/:x/y/:y, then you can't change x or y. Note that this does mean if you can access
            // the document from /x/:x, then you'd be able to change y.
            for(let layer of access_layers.layers){
                if(validated_request_body[`${layer}_id`] && validated_request_body[`${layer}_id`] !== req.params[layer]){
                    res.status(403);
                    res.json({ error: `The system does not support changing the ${layer}_id of the document with this endpoint.` });
                    return;
                }
            }

            /*let { error: pre_save_error } = await req.schema.handle_pre_save(req, validated_request_body);
            if (pre_save_error) {
                res.status(400);
                res.json({ error: pre_save_error.message });
                return;
            }*/

            let results;
            try {
                results = await collection.perform_create_and_side_effects(validated_request_body);
                //results = await collection.mongoose_model.create(validated_request_body);
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
    }
}