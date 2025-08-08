import * as z from "zod/v4";
import { Request, Response } from "express";
import { F_Collection } from "../F_Collection.js";
export type Operation = 'get' | 'update' | 'create' | 'delete';
export declare abstract class F_Security_Model<Collection_ID extends string, ZodSchema extends z.ZodType> {
    collection: F_Collection<Collection_ID, ZodSchema>;
    needs_auth_user: boolean;
    static auth_fetcher: (req: Request) => Promise<Auth_Data | undefined>;
    constructor(collection: F_Collection<Collection_ID, ZodSchema>);
    abstract has_permission(req: Request, res: Response, find: {
        [key: string]: any;
    }, operation: Operation): Promise<boolean>;
    abstract handle_empty_query_results(req: Request, res: Response, operation: Operation): Promise<Empty_Query_Possibilities>;
    static set_auth_fetcher(fetcher: (req: Request) => Promise<Auth_Data | undefined>): void;
    static has_permission(models: F_Security_Model<string, any>[], req: Request, res: Response, find: {
        [key: string]: any;
    }, operation: Operation): Promise<F_Security_Model<string, any>>;
    static model_with_permission(models: F_Security_Model<string, any>[], req: Request, res: Response, find: {
        [key: string]: any;
    }, operation: Operation): Promise<F_Security_Model<string, any>>;
}
export type Auth_Data = {
    user_id: string;
    layers: {
        layer_id: string;
        permissions: {
            [key: string]: Operation[];
        };
        special_permissions: {
            [key: string]: string[];
        };
    }[];
};
export type Authenticated_Request = Request & {
    auth: Auth_Data;
};
export type Empty_Query_Possibilities = {
    data: null;
} | {
    error: string;
};
