import * as z from "zod/v4";
import mongoose, { Model } from "mongoose";
import { F_Security_Model } from "./F_Security_Models/F_Security_Model.js";
export type F_Layer<Collection_ID extends string, ZodSchema extends z.ZodObject> = {
    layers: string[];
    security_models: F_Security_Model<Collection_ID, ZodSchema>[];
};
export declare class F_Collection<Collection_ID extends string, ZodSchema extends z.ZodObject> {
    collection_id: Collection_ID;
    collection_name_plural: string;
    validator: ZodSchema;
    mongoose_schema: any;
    mongoose_model: Model<z.infer<ZodSchema>>;
    query_validator_server: z.ZodType;
    query_validator_client: z.ZodType;
    put_validator: z.ZodType;
    post_validator: z.ZodType;
    is_compiled: boolean;
    access_layers: F_Layer<Collection_ID, ZodSchema>[];
    create_hooks: ((session: mongoose.mongo.ClientSession, created_document: z.output<ZodSchema>) => Promise<void>)[];
    update_hooks: ((session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>)[];
    post_create_hooks: ((created_document: z.output<ZodSchema>) => Promise<void>)[];
    post_update_hooks: ((created_document: z.output<ZodSchema>) => Promise<void>)[];
    constructor(collection_name: Collection_ID, collection_name_plural: string, validator: ZodSchema);
    add_layers(layers: string[], security_models: F_Security_Model<Collection_ID, ZodSchema>[], is_layer_owner?: boolean): void;
    add_create_hook(hook: (session: mongoose.mongo.ClientSession, created_document: z.output<ZodSchema>) => Promise<void>): void;
    add_update_hook(hook: (session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>): void;
    add_post_create_hook(hook: (created_document: z.output<ZodSchema>) => Promise<void>): void;
    add_post_update_hook(hook: (updated_document: z.output<ZodSchema>) => Promise<void>): void;
    mongoose_create(data: z.output<ZodSchema>): Promise<z.output<ZodSchema>>;
    mongoose_update(find: any, data: z.output<ZodSchema>): Promise<z.output<ZodSchema>>;
}
