import * as z from "zod/v4";
import { Router, Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { createDocument, ZodOpenApiPathsObject } from 'zod-openapi';
import { OpenApiBuilder } from 'openapi3-ts/oas31';

import { F_Collection } from "./F_Collection.js";
import { F_Security_Model, Authenticated_Request } from "./F_Security_Models/F_Security_Model.js";
import { query_object_to_mongodb_limits, query_object_to_mongodb_query } from "./utils/query_object_to_mongodb_query.js";
import { z_mongodb_id } from "./utils/mongoose_from_zod.js";
import { openAPI_from_collection } from "./utils/openapi_from_zod.js";

export function compile<Collection_ID extends string, ZodSchema extends z.ZodType>(app: Router, collection: F_Collection<Collection_ID, ZodSchema>, api_prefix: string){
    for(let access_layers of collection.access_layers){

        /*app.use((req, res, next) => {
            console.log(`${req.method} ${req.originalUrl}`)
            next();
        })*/

        let base_layers_path_components = access_layers.layers.flatMap(ele => [ele, ':' + ele]);

        let get_one_path = [
            api_prefix,
            ...base_layers_path_components,
            `${collection.collection_id}/:document_id`
        ].join('/')

        // get individual document
        app.get(get_one_path, async (req: Request, res: Response) => {
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
                res.json({ error: `You do not have permission to fetch documents from ${req.params.document_type}.` });
                return;
            }

            let document;
            try {
                //@ts-expect-error
                document = await collection.model.findOne(find, undefined, { 'lean': true });
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
        })


        let get_multiple_path = [
            api_prefix,
            ...base_layers_path_components,
            collection.collection_id
        ].join('/')

        app.get(get_multiple_path, async (req: Request, res: Response) => {
            let validated_query_args: { [key: string]: any } ;
            try {
                validated_query_args = collection.query_schema.parse(req.query);
            } catch(err){
                if(err instanceof z.ZodError){
                    res.status(403);
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
                res.json({ error: `You do not have permission to fetch documents from ${req.params.document_type}.` });
                return;
            }
           
            let documents;
            try {
                //@ts-expect-error
                let query = collection.model.find(find, undefined, { 'lean': true });
                let fetch = query_object_to_mongodb_limits(query, collection.query_schema);
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
                res.json({ error: `You do not have permission to fetch documents from ${req.params.document_type}.` });
                return;
            }

            if(collection.raw_schema.updated_by?.type === String) {
                // if the security schema required the user to be logged in, then req.auth.user_id will not be null
                if((req as Authenticated_Request).auth?.user_id){
                    req.body.updated_by = (req as Authenticated_Request).auth?.user_id;
                } else {
                    req.body.updated_by = null;
                }
            }

            if(collection.raw_schema.updated_at?.type === Date) {
                req.body.updated_at = new Date();
            }

            // TODO: it might be possible to build a validator that matches mongoDB's update
            // syntax to allow for targeted updating of nested stuff
            let validated_request_body;
            try {
                validated_request_body = await collection.put_schema.parse(req.body);
            } catch(err){
                 if(err instanceof z.ZodError){
                    res.status(403);
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
                //@ts-expect-error
                results = await collection.model.findOneAndUpdate(find, validated_request_body, { returnDocument: 'after', lean: true });
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
                res.json({ error: `You do not have permission to fetch documents from ${req.params.document_type}.` });
                return;
            }

            if(collection.raw_schema.updated_by?.type === String) {
                // if the security schema required the user to be logged in, then req.auth.user_id will not be null
                if((req as Authenticated_Request).auth?.user_id){
                    req.body.updated_by = (req as Authenticated_Request).auth?.user_id;
                } else {
                    req.body.updated_by = null;
                }
            }

            if(collection.raw_schema.updated_at?.type === Date) {
                req.body.updated_at = new Date();
            }

            if(collection.raw_schema.created_by?.type === String) {
                // if the security schema required the user to be logged in, then req.auth.user_id will not be null
                if((req as Authenticated_Request).auth?.user_id){
                    req.body.created_by = (req as Authenticated_Request).auth?.user_id;
                } else {
                    req.body.created_by = null;
                }
            }

            if(collection.raw_schema.created_at?.type === Date) {
                req.body.created_at = new Date();
            }

            let validated_request_body;
            try {
                validated_request_body = await collection.post_schema.parse(req.body);
            } catch(err){
                 if(err instanceof z.ZodError){
                    res.status(403);
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
                results = await collection.model.create(validated_request_body);
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
                res.json({ error: `You do not have permission to fetch documents from ${req.params.document_type}.` });
                return;
            }

            let results;
            try {
                //@ts-expect-error
                results = await collection.model.findOneAndDelete(find, {lean: true });
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

export function to_openapi<Collection_ID extends string, ZodSchema extends z.ZodType>(collections: F_Collection<Collection_ID, ZodSchema>[], api_prefix: string): string {
    
    let open_api_builder = new OpenApiBuilder({
        openapi: '3.1.0',
        info: {
            title: 'title',
            description: 'description',
            version: '0.0.0'
        }
    });

    open_api_builder.addServer({
        url: api_prefix,
        description: 'description'
    });

    open_api_builder.addSecurityScheme('Authorization', {
        name: 'Authorization',
        type: 'apiKey',
        description: 'Your token',
        in: 'header',
        scheme: 'Bearer'
    })

    for(let collection of collections){
        openAPI_from_collection(open_api_builder, api_prefix, collection);
    }
    
    return open_api_builder.getSpecAsJson();
    
    
    
    
    
    /*let openapi_paths = {} as ZodOpenApiPathsObject;

    for(let collection of collections){
        for(let access_layers of collection.access_layers){

            let base_layers_path_components = access_layers.layers.flatMap(ele => [ele, `{${ele}_id}`]);

            let document_path = [
                api_prefix,
                ...base_layers_path_components,
                `${collection.collection_id}/{document_id}`
            ].join('/')

            let collection_path = [
                api_prefix,
                ...base_layers_path_components,
                collection.collection_id
            ].join('/')

            let document_path_validator_entries = { document_id: z_mongodb_id } as {[key:string]: typeof z_mongodb_id};
            access_layers.layers.forEach(ele => {
                document_path_validator_entries[ele] = z_mongodb_id;
            })
            let document_path_validator = z.object(document_path_validator_entries);

            let collection_path_validator_entries = { document_id: z_mongodb_id } as {[key:string]: typeof z_mongodb_id};
            access_layers.layers.forEach(ele => {
                collection_path_validator_entries[ele] = z_mongodb_id;
            })
            let collection_path_validator = z.object(collection_path_validator_entries);
            

            openapi_paths[document_path] = {
                get: {
                    requestParams: { path: document_path_validator },
                    responses: {
                        '200': {
                            description: '200 OK',
                            content: {
                                'application/json': { schema: z.object({ data: collection.raw_schema}) },
                            },
                        },
                        '403': {
                            description: '403 No Permission',
                            content: {
                                'application/json': { schema: z.object({ error: z.string() }) },
                            },
                        },
                        '500': {
                            description: '500 Server Error',
                            content: {
                                'application/json': { schema: z.object({ error: z.string() }) },
                            },
                        },
                    },
                },
                put: {
                    requestParams: { path: document_path_validator },
                    requestBody: {
                        content: {
                            'application/json': { schema: collection.put_schema },
                        },
                    },
                    responses: {
                        '200': {
                            description: '200 OK',
                            content: {
                                'application/json': { schema: z.object({ data: collection.raw_schema}) },
                            },
                        },
                        '403': {
                            description: '403 No Permission',
                            content: {
                                'application/json': { schema: z.object({ error: z.string() }) },
                            },
                        },
                        '500': {
                            description: '500 Server Error',
                            content: {
                                'application/json': { schema: z.object({ error: z.string() }) },
                            },
                        },
                    },
                },
                delete: {
                    requestParams: { path: document_path_validator },
                    responses: {
                        '200': {
                            description: '200 OK',
                            content: {
                                'application/json': { schema: z.object({ data: collection.raw_schema}) },
                            },
                        },
                        '403': {
                            description: '403 No Permission',
                            content: {
                                'application/json': { schema: z.object({ error: z.string() }) },
                            },
                        },
                        '500': {
                            description: '500 Server Error',
                            content: {
                                'application/json': { schema: z.object({ error: z.string() }) },
                            },
                        },
                    },
                }
            }

            openapi_paths[collection_path] = {
                get: {
                    requestParams: {
                        path: collection_path_validator,
                        query: collection.query_schema,
                    },
                    responses: {
                        '200': {
                            description: '200 OK',
                            content: {
                                'application/json': { schema: z.array(z.object({ data: collection.raw_schema})) },
                            },
                        },
                        '403': {
                            description: '403 No Permission',
                            content: {
                                'application/json': { schema: z.object({ error: z.string() }) },
                            },
                        },
                        '500': {
                            description: '500 Server Error',
                            content: {
                                'application/json': { schema: z.object({ error: z.string() }) },
                            },
                        },
                    },
                },
                post: {
                    requestParams: { path: collection_path_validator },
                    requestBody: {
                        content: {
                            'application/json': { schema: collection.post_schema },
                        },
                    },
                    responses: {
                        '200': {
                            description: '200 OK',
                            content: {
                                'application/json': { schema: z.object({ data: collection.raw_schema}) },
                            },
                        },
                        '403': {
                            description: '403 No Permission',
                            content: {
                                'application/json': { schema: z.object({ error: z.string() }) },
                            },
                        },
                        '500': {
                            description: '500 Server Error',
                            content: {
                                'application/json': { schema: z.object({ error: z.string() }) },
                            },
                        },
                    },
                },
            }
        }
    }

    return createDocument({
        openapi: '3.1.0',
        info: {
            title: 'My API',
            version: '1.0.0',
        },
        paths: openapi_paths,
    });*/
}