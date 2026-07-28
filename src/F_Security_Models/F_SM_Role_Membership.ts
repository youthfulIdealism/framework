import * as z from "zod/v4";
import { Request, Response } from "express";
import { F_Collection } from "../F_Collection.js";
import { Cache } from "../utils/cache.js";
import { Authenticated_Request, Empty_Query_Possibilities, F_Security_Model, Operation } from "./F_Security_Model.js";

let operation_permission_map = {
    'get': 'read',
    'create': 'create',
    'update': 'update',
    'delete': 'delete'
}

export class F_SM_Role_Membership<Collection_ID extends string, ZodSchema extends z.ZodObject> extends F_Security_Model<Collection_ID, ZodSchema> {
    layer_collection_id?: string;

    constructor(collection: F_Collection<Collection_ID, ZodSchema>,
        layer_collection: F_Collection<string, any> | undefined,
    ){
        super(collection);
        this.needs_auth_user = true;
        this.layer_collection_id = layer_collection?.collection_id;
    }

    async has_permission(req: Authenticated_Request, res: Response, find: {[key: string]: any}, operation: Operation): Promise<boolean> {
        // the only way the layer ID is undefined is if the layer is the document being accessed
        // eg the institution id or the client id
        let layer_document_id = this.layer_collection_id ? (req.params[this.layer_collection_id] ?? req.params.document_id) : undefined;
        let auth_permissions = req.auth.layers.find(ele => ele.layer === this.layer_collection_id && ele.layer_id + '' === layer_document_id);
        if(!auth_permissions){ return false; }
        if(!auth_permissions.permissions){ console.warn(`request auth object was missing its permissions field`); return false; }
        if(!auth_permissions.permissions[this.collection.collection_name_plural]){ console.warn(`request auth object was missing its permissions.${this.collection.collection_name_plural} field`); return false; }
        return auth_permissions.permissions[this.collection.collection_name_plural].includes(operation_permission_map[operation] as Operation);
    }
    
    async handle_empty_query_results(req: Request, res: Response, operation: Operation): Promise<Empty_Query_Possibilities> {
        return { data: null };
    }
}