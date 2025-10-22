import * as z from "zod/v4";
import mongoose, { Model } from "mongoose";
import { F_Security_Model } from "./F_Security_Models/F_Security_Model.js";
export type CollectionType<Col extends F_Collection<string, Validator>, Validator extends z.ZodObject> = z.output<Col['validator']>;
export type F_Layer<Collection_ID extends string, ZodSchema extends z.ZodObject> = {
    layers: string[];
    security_models: F_Security_Model<Collection_ID, ZodSchema>[];
};
type Partial_Mask = {
    _id: true;
};
type ZodPartial_Return_Type<T extends (arg: Partial_Mask) => any> = T extends (arg: Partial_Mask) => infer R ? R : any;
export declare class F_Collection<Collection_ID extends string, ZodSchema extends z.ZodObject> {
    collection_id: Collection_ID;
    collection_name_plural: string;
    validator: ZodSchema;
    mongoose_schema: any;
    mongoose_model: Model<z.infer<ZodSchema>>;
    query_validator_server: z.ZodType;
    query_validator_client: z.ZodType;
    put_validator: ReturnType<ZodSchema['partial']>;
    post_validator: ZodPartial_Return_Type<ZodSchema['partial']>;
    is_compiled: boolean;
    access_layers: F_Layer<Collection_ID, ZodSchema>[];
    create_hooks: ((session: mongoose.mongo.ClientSession, created_document: z.output<ZodSchema>) => Promise<void>)[];
    update_hooks: ((session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>)[];
    delete_hooks: ((session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>)[];
    post_create_hooks: ((created_document: z.output<ZodSchema>) => Promise<void>)[];
    post_update_hooks: ((created_document: z.output<ZodSchema>) => Promise<void>)[];
    post_delete_hooks: ((deleted_document: z.output<ZodSchema>) => Promise<void>)[];
    constructor(collection_name: Collection_ID, collection_name_plural: string, validator: ZodSchema);
    add_layers(layers: string[], security_models: F_Security_Model<Collection_ID, ZodSchema>[]): void;
    on_create(hook: (session: mongoose.mongo.ClientSession, created_document: z.output<ZodSchema>) => Promise<void>): void;
    on_update(hook: (session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>): void;
    on_delete(hook: (session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>): void;
    after_create(hook: (created_document: z.output<ZodSchema>) => Promise<void>): void;
    after_update(hook: (updated_document: z.output<ZodSchema>) => Promise<void>): void;
    after_delete(hook: (deleted_document: z.output<ZodSchema>) => Promise<void>): void;
    perform_create_and_side_effects(data: z.output<this['post_validator']>): Promise<z.output<ZodSchema>>;
    perform_update_and_side_effects(find: any, data: z.output<this['put_validator']>): Promise<z.output<ZodSchema>>;
    perform_delete_and_side_effects(find: any): Promise<z.output<ZodSchema>>;
}
export {};
