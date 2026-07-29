import * as z from "zod/v4";
import { Request, Response } from "express";
import { F_Collection } from "@liminalfunctions/framework/F_Collection.js";
import { Cache } from "@liminalfunctions/framework/cache.js"
import { Authenticated_Request, Empty_Query_Possibilities, F_Security_Model, Operation } from "@liminalfunctions/framework/F_Security_Model.js";

let operation_permission_map = {
    'get': 'read',
    'create': 'create',
    'update': 'update',
    'delete': 'delete'
}

export class F_SM_Role_Membership_With_Parent_Path<Collection_ID extends string, ZodSchema extends z.ZodObject> extends F_Security_Model<Collection_ID, ZodSchema> {
    layer_collection_id?: string;

    constructor(collection: F_Collection<Collection_ID, ZodSchema>,
        layer_collection: F_Collection<string, any> | undefined,
    ){
        super(collection);
        this.needs_auth_user = true;
        this.layer_collection_id = layer_collection?.collection_id;
    }

    async has_permission(req: Authenticated_Request, res: Response, find: {[key: string]: any}, operation: Operation): Promise<boolean> {
        let permission_name = operation_permission_map[operation];
        let enabled_layer_ids = new Set(req.auth.layers.filter(ele => ele.layer === this.collection.collection_id).filter(ele => ele.permissions[this.collection.collection_name_plural].includes(permission_name as Operation)).map(ele => ele.layer_id + ''))
        let id_field = `${this.layer_collection_id}_ids`;

        switch(operation) {
            case "get":
            case "update":
            case "delete":
                if(find[id_field]) {
                    if(typeof find[id_field] === 'string'){
                        return enabled_layer_ids.has(find[id_field]);
                    } else if( Array.isArray(find[id_field].$in) ) {
                        let find_ids = find[id_field].$in as string[];
                        return find_ids.find(ele => enabled_layer_ids.has(ele)) !== undefined;
                    }
                }
                return false;
            case "create":
                let create_ids = req.body[id_field];
                if(!Array.isArray(create_ids) || create_ids.find(ele => typeof ele !== 'string')){ break; }
                return create_ids.find(ele => enabled_layer_ids.has(ele)) !== undefined;
        }

        return false;
    }

    async handle_empty_query_results(req: Request, res: Response, operation: Operation): Promise<Empty_Query_Possibilities> {
        return { data: null }
    }
}