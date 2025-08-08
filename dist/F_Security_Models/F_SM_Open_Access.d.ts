import * as z from "zod/v4/core";
import { Request, Response } from "express";
import { Empty_Query_Possibilities, F_Security_Model, Operation } from "./F_Security_Model.js";
import { F_Collection } from "../F_Collection.js";
export declare class F_SM_Open_Access<Collection_ID extends string, ZodSchema extends z.$ZodType> extends F_Security_Model<Collection_ID, ZodSchema> {
    constructor(collection: F_Collection<Collection_ID, ZodSchema>);
    has_permission(req: Request, res: Response, find: {
        [key: string]: any;
    }, operation: Operation): Promise<boolean>;
    handle_empty_query_results(req: Request, res: Response, operation: Operation): Promise<Empty_Query_Possibilities>;
}
