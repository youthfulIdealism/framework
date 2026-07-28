import * as z from "zod/v4";
import { Request, Response } from "express";
import { F_Collection } from "@liminalfunctions/framework/F_Collection.js";
import { Authenticated_Request, Empty_Query_Possibilities, F_Security_Model, Operation } from "@liminalfunctions/framework/F_Security_Model.js";
export declare class F_SM_Role_Membership_With_Parent_Path<Collection_ID extends string, ZodSchema extends z.ZodObject> extends F_Security_Model<Collection_ID, ZodSchema> {
    layer_collection_id?: string;
    constructor(collection: F_Collection<Collection_ID, ZodSchema>, layer_collection: F_Collection<string, any> | undefined);
    has_permission(req: Authenticated_Request, res: Response, find: {
        [key: string]: any;
    }, operation: Operation): Promise<boolean>;
    handle_empty_query_results(req: Request, res: Response, operation: Operation): Promise<Empty_Query_Possibilities>;
}
