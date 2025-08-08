import * as z from "zod/v4/core";

import { F_Collection } from "./F_Collection.js";

import { Router, Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { F_Security_Model } from "./F_Security_Models/F_Security_Model.js";

export function compile<Collection_ID extends string, ZodSchema extends z.$ZodType>(app: Router, collection: F_Collection<Collection_ID, ZodSchema>, api_prefix: string){
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

            //@ts-expect-error
            let document = await collection.model.findOne(find, undefined, { 'lean': true });
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
            let find = { } as { [key: string]: any } 
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
                documents = await collection.model.find(find, undefined, { 'lean': true });
            } catch(err){
                if (err.name == 'CastError') {
                    res.status(400);
                    res.json({ error: 'one of the IDs you passed to the query was not a valid MongoDB object ID.' });
                    return;
                } else {
                    throw err;
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


    }
}