import * as z from "zod/v4";
import { Request, Response } from "express";
import { F_Collection } from "../F_Collection.js";
import { Authenticated_Request, Empty_Query_Possibilities, F_Security_Model, Operation } from "./F_Security_Model.js";

export class F_SM_Ownership<Collection_ID extends string, ZodSchema extends z.ZodObject> extends F_Security_Model<Collection_ID, ZodSchema> {
    user_id_field: string;

    constructor(collection: F_Collection<Collection_ID, ZodSchema>, user_id_field = 'user_id'){
        super(collection);
        this.needs_auth_user = true;
        this.user_id_field = user_id_field;
    }

    async has_permission(req: Authenticated_Request, res: Response, find: {[key: string]: any}, operation: Operation): Promise<boolean> {
        let user_id = '' + req.auth.user_id;
        
        if (operation === 'get') {
            // if we're fetching a specific document by its ID, it's valid to get
            // it as long as we modify the find so that it only returns documents
            // owned by the current user
            if (req.params.document_id) {
                find[this.user_id_field] = user_id;

                return true;
            }

            // if we're fetching a document and filtering by the user's ID already,
            // then this security model is satisfied
            if (find[this.user_id_field] === user_id) {
                return true;
            }
        }

        // if we're updating a specific document, it's valid as long as we modify the
        // find so that it only modifies documents owned by the current user
        if (operation === 'update') {
            find[this.user_id_field] = user_id;
            return true;
        }

        // if we're creating a document, it's valid as long as it's owned by the current
        // user.
        if (operation === 'create') {
            if (req.body[this.user_id_field] === user_id) {
                return true;
            }
        }

        // if we're deleting a specific document, it's valid as long as we modify the
        // find so that it only deletes documents owned by the current user
        if (operation === 'delete') {
            find[this.user_id_field] = user_id;
            return true;
        }

        return false;
    }
    
    async handle_empty_query_results(req: Request, res: Response, operation: Operation): Promise<Empty_Query_Possibilities> {
        if (req.params.document_id) {
            let document_result = await this.collection.model.findById(req.params.document_id);

            if (document_result) {
                res.status(403);
                return { error: `You do not have permission to ${operation} documents from ${req.params.document_type}.` };
            }
        }

        return { data: null };
    }
}