import * as z from "zod/v4";
import { Request, Response } from "express";
import { F_Collection } from "../F_Collection.js";
import { Cache } from "../utils/cache.js";
import { Authenticated_Request, Empty_Query_Possibilities, F_Security_Model, Operation } from "./F_Security_Model.js";
import mongoose from "mongoose";

let operation_permission_map = {
    'get': 'read',
    'create': 'create',
    'update': 'update',
    'delete': 'delete'
}

export class F_SM_Role_Membership<Collection_ID extends string, ZodSchema extends z.ZodObject> extends F_Security_Model<Collection_ID, ZodSchema> {
    user_id_field: string;
    role_id_field: string;
    layer_collection_id: string;
    role_membership_collection: F_Collection<string, any>;
    role_membership_cache: Cache<any>;
    role_collection: F_Collection<string, any>;
    role_cache: Cache<any>;

    constructor(collection: F_Collection<Collection_ID, ZodSchema>,
        layer_collection: F_Collection<string, any>,
        role_membership_collection: F_Collection<string, any>,
        role_collection: F_Collection<string, any>,
        role_membership_cache?: Cache<any>,
        role_cache?: Cache<any>,
        user_id_field = 'user_id',
        role_id_field = 'role_id',
    ){
        super(collection);
        this.needs_auth_user = true;
        this.user_id_field = user_id_field;
        this.role_id_field = role_id_field;
        this.layer_collection_id = layer_collection.collection_id;
        this.role_membership_collection = role_membership_collection;
        this.role_membership_cache = role_membership_cache ?? new Cache(60);
        this.role_collection = role_collection;
        this.role_cache = role_cache ?? new Cache(60);

        if(!this.role_collection.mongoose_schema.permissions){
            throw new Error(`could not find field "permissions" on role collection. Permissions should be an object of the format {[key: collection_id]: ('read'| 'create'| 'update'| 'delete')[]}`)
        }
    }

    async has_permission(req: Authenticated_Request, res: Response, find: {[key: string]: any}, operation: Operation): Promise<boolean> {
        let user_id = req.auth.user_id;
        // the only way the layer ID is undefined is if the layer is the document being accessed
        let layer_id = req.params[this.layer_collection_id] ?? req.params.document_id;

        // return the role membership associated with the layer. This uses the cache heavily, so it should be
        // a cheap operation even though it makes an extra database query. Use the cache's first_fetch_then_refresh
        // method so that we aren't keeping out-of-date auth data in the cache.
        let role_membership = await this.role_membership_cache.first_fetch_then_refresh(`${user_id}-${layer_id}`, async () => {
            let role_memberships = await this.role_membership_collection.mongoose_model.find({ 
                [this.user_id_field]: user_id,
                [`${this.layer_collection_id}_id`]: new mongoose.Types.ObjectId(layer_id)
            })

            if(role_memberships.length > 1){
                console.warn(`in F_SM_Role_Membership, more than one role membership for user ${user_id} at layer ${this.layer_collection_id} found.`)
            }
            return role_memberships[0];
        })

        if(!role_membership){ return false; }
        if(!role_membership[this.role_id_field]){ console.warn(`role membership collection ${this.role_membership_collection.collection_id} did not have role ID filed ${this.role_id_field}`); return false;}

        // return the role associated with the role membership. This uses the cache heavily, so it should be
        // a cheap operation even though it makes an extra database query. Use the cache's first_fetch_then_refresh
        // method so that we aren't keeping out-of-date auth data in the cache.
        let role = await this.role_cache.first_fetch_then_refresh(role_membership[this.role_id_field], async () => {
            let role = await this.role_collection.mongoose_model.findById(role_membership[this.role_id_field]);
            return role;
        })
        
        if(!role){ return false; }
        if(!role.permissions){ console.warn(`role collection ${this.role_collection.collection_id} was missing its permissions field`); return false; }
        if(!role.permissions[this.collection.collection_id]){ console.warn(`role collection ${this.role_collection.collection_id} was missing its permissions.${this.collection.collection_id} field`); return false; }
        return role.permissions[this.collection.collection_id].includes(operation_permission_map[operation]);
    }
    
    async handle_empty_query_results(req: Request, res: Response, operation: Operation): Promise<Empty_Query_Possibilities> {
        return { data: null };
    }
}