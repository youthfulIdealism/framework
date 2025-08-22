import * as z from "zod/v4";
import { Request, Response } from "express";
import { F_Collection } from "../F_Collection.js";
import { Cache } from "../utils/cache.js";
import { Authenticated_Request, Empty_Query_Possibilities, F_Security_Model, Operation } from "./F_Security_Model.js";
export declare class F_SM_Role_Membership<Collection_ID extends string, ZodSchema extends z.ZodObject> extends F_Security_Model<Collection_ID, ZodSchema> {
    user_id_field: string;
    role_id_field: string;
    layer_collection_id: string;
    role_membership_collection: F_Collection<string, any>;
    role_membership_cache: Cache<any>;
    role_collection: F_Collection<string, any>;
    role_cache: Cache<any>;
    constructor(collection: F_Collection<Collection_ID, ZodSchema>, layer_collection: F_Collection<string, any>, role_membership_collection: F_Collection<string, any>, role_collection: F_Collection<string, any>, role_membership_cache?: Cache<any>, role_cache?: Cache<any>, user_id_field?: string, role_id_field?: string);
    has_permission(req: Authenticated_Request, res: Response, find: {
        [key: string]: any;
    }, operation: Operation): Promise<boolean>;
    handle_empty_query_results(req: Request, res: Response, operation: Operation): Promise<Empty_Query_Possibilities>;
}
