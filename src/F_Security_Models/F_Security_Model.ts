
import * as z from "zod/v4";
import { Router, Request, Response } from "express";
import { F_Collection } from "../F_Collection.js";

export type Operation = 'get' | 'update' | 'create' | 'delete';

export abstract class F_Security_Model<Collection_ID extends string, ZodSchema extends z.ZodType> {
    collection: F_Collection<Collection_ID, ZodSchema>;
    needs_auth_user: boolean
    static auth_fetcher: (req: Request) => Promise<Auth_Data | undefined>

    constructor(collection: F_Collection<Collection_ID, ZodSchema>) {
        this.collection = collection;
    }

    /**
     * Returns true if this security model can grant permission to perform the operation.
     * This may be accomplished by modifying the mongodb filter that will be applied during
     * the fetch/update: for example, a security model that allows modifying only members of
     * a certain institution might add { institution_id: xxxxx } to the find.
     * @param req 
     * @param res 
     * @param find 
     * @param operation 
     */
    abstract has_permission(req: Request, res: Response, find: {[key: string]: any}, operation: Operation): Promise<boolean>;
    
    /**
     * In the event that no documents are returned by the mongodb operation, it's necessary to find
     * out if this was caused by modifications to the mongodb filter, or if it was caused by a lack
     * of documents to operate on.
     * 
     * In the event that there are documents but the user lacks permission to act on them, this method
     * is expected to set the response status to 403.
     * 
     * @param req 
     * @param res 
     * @param operation 
     */
    abstract handle_empty_query_results(req: Request, res: Response, operation: Operation): Promise<Empty_Query_Possibilities>;

    static set_auth_fetcher(fetcher: (req: Request) => Promise<Auth_Data | undefined>){
        F_Security_Model.auth_fetcher = fetcher;
    }

    static async has_permission(models: F_Security_Model<string, any>[], req: Request, res: Response, find: {[key: string]: any}, operation: Operation){ console.error(`F_Security_Model.has_permission is deprecated in favor of F_Security_Model.model_with_permission.`); return await F_Security_Model.model_with_permission(models, req, res, find, operation); }
    static async model_with_permission(models: F_Security_Model<string, any>[], req: Request, res: Response, find: {[key: string]: any}, operation: Operation): Promise<F_Security_Model<string, any>> {
        let has_attempted_authenticating_user = false;
        
        for (let security_model of models) {
            // if the security model needs user auth data, fetch it.
            if (security_model.needs_auth_user && !has_attempted_authenticating_user) {
                has_attempted_authenticating_user = true;
                (req as Authenticated_Request).auth = await F_Security_Model.auth_fetcher(req);
            }

            // if the user auth data fetch failed, and the security model needs that data, don't bother using the security model.
            if (security_model.needs_auth_user && !(req as Authenticated_Request).auth) {
                continue;
            }

            // if the security model is a good candidate, return it.
            if (await security_model.has_permission(req, res, find, operation)) {
                return security_model;
            }
        }
        return undefined;
    }
}

export type Auth_Data = {
    user_id: string,
    layers: {
        layer_id: string,
        permissions: {[key: string]: Operation[]},
        special_permissions: {[key: string]: string[]}
    }[]
}

export type Authenticated_Request = Request & {
    auth: Auth_Data
}

export type Empty_Query_Possibilities = { data: null} | { error: string };