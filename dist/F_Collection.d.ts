import * as z from "zod/v4";
import mongoose, { ClientSession, Model } from "mongoose";
import { F_Security_Model } from "./F_Security_Models/F_Security_Model.js";
export type CollectionType<Col extends F_Collection<string, Validator>, Validator extends z.ZodObject> = z.output<Col['validator']>;
export type F_Layer<Collection_ID extends string, ZodSchema extends z.ZodObject> = {
    layers: string[];
    security_models: F_Security_Model<Collection_ID, ZodSchema>[];
};
type Prev_Depth = [never, 0, 1, 2, 3, 4, 5];
export type Array_Child_Paths<T, Depth extends number = 5> = [Depth] extends [never] ? never : {
    [K in keyof T & string]-?: NonNullable<T[K]> extends readonly (infer E)[] ? (NonNullable<E> extends {
        _id: any;
    } ? K : never) : NonNullable<T[K]> extends Date ? never : NonNullable<T[K]> extends object ? `${K}.${Array_Child_Paths<NonNullable<T[K]>, Prev_Depth[Depth]>}` : never;
}[keyof T & string];
export type Array_Child_At<T, P extends string> = P extends `${infer Head}.${infer Rest}` ? Head extends keyof T ? Array_Child_At<NonNullable<T[Head]>, Rest> : never : P extends keyof T ? (NonNullable<T[P]> extends readonly (infer E)[] ? NonNullable<E> : never) : never;
type Array_Item_Type<ZodSchema extends z.ZodObject, P extends string> = string extends P ? any : Array_Child_At<z.output<ZodSchema>, P>;
export type Array_Item_Hook<ZodSchema extends z.ZodObject, P extends string = string> = (session: mongoose.mongo.ClientSession, array_item: Array_Item_Type<ZodSchema, P>, parent_document: z.output<ZodSchema>) => Promise<void>;
export type Array_Item_Post_Hook<ZodSchema extends z.ZodObject, P extends string = string> = (array_item: Array_Item_Type<ZodSchema, P>, parent_document: z.output<ZodSchema>) => Promise<void>;
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
    advanced_query_validator_server: z.ZodType;
    advanced_query_validator_client: z.ZodType;
    put_validator: ReturnType<ZodSchema['partial']>;
    post_validator: ZodPartial_Return_Type<ZodSchema['partial']>;
    is_compiled: boolean;
    array_children_map: Map<string, z.ZodType>;
    array_children_post_map: Map<string, z.ZodType>;
    access_layers: F_Layer<Collection_ID, ZodSchema>[];
    create_hooks: ((session: mongoose.mongo.ClientSession, created_document: z.output<ZodSchema>) => Promise<void>)[];
    update_hooks: ((session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>)[];
    delete_hooks: ((session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>)[];
    post_create_hooks: ((created_document: z.output<ZodSchema>) => Promise<void>)[];
    post_update_hooks: ((created_document: z.output<ZodSchema>) => Promise<void>)[];
    post_delete_hooks: ((deleted_document: z.output<ZodSchema>) => Promise<void>)[];
    array_item_create_hooks: Map<string, Array_Item_Hook<ZodSchema>[]>;
    array_item_update_hooks: Map<string, Array_Item_Hook<ZodSchema>[]>;
    array_item_delete_hooks: Map<string, Array_Item_Hook<ZodSchema>[]>;
    array_item_post_create_hooks: Map<string, Array_Item_Post_Hook<ZodSchema>[]>;
    array_item_post_update_hooks: Map<string, Array_Item_Post_Hook<ZodSchema>[]>;
    array_item_post_delete_hooks: Map<string, Array_Item_Post_Hook<ZodSchema>[]>;
    constructor(collection_name: Collection_ID, collection_name_plural: string, validator: ZodSchema, database?: typeof mongoose);
    add_layers(layers: string[], security_models: F_Security_Model<Collection_ID, ZodSchema>[]): void;
    on_create(hook: (session: mongoose.mongo.ClientSession, created_document: z.output<ZodSchema>) => Promise<void>): void;
    on_update(hook: (session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>): void;
    on_delete(hook: (session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>): void;
    after_create(hook: (created_document: z.output<ZodSchema>) => Promise<void>): void;
    after_update(hook: (updated_document: z.output<ZodSchema>) => Promise<void>): void;
    after_delete(hook: (deleted_document: z.output<ZodSchema>) => Promise<void>): void;
    array_on_create<P extends Array_Child_Paths<z.output<ZodSchema>>>(key: P, hook: Array_Item_Hook<ZodSchema, P>): void;
    array_on_update<P extends Array_Child_Paths<z.output<ZodSchema>>>(key: P, hook: Array_Item_Hook<ZodSchema, P>): void;
    array_on_delete<P extends Array_Child_Paths<z.output<ZodSchema>>>(key: P, hook: Array_Item_Hook<ZodSchema, P>): void;
    array_post_create<P extends Array_Child_Paths<z.output<ZodSchema>>>(key: P, hook: Array_Item_Post_Hook<ZodSchema, P>): void;
    array_post_update<P extends Array_Child_Paths<z.output<ZodSchema>>>(key: P, hook: Array_Item_Post_Hook<ZodSchema, P>): void;
    array_post_delete<P extends Array_Child_Paths<z.output<ZodSchema>>>(key: P, hook: Array_Item_Post_Hook<ZodSchema, P>): void;
    perform_create_and_side_effects(data: z.output<this['post_validator']>, session?: ClientSession): Promise<z.output<ZodSchema>>;
    perform_update_and_side_effects(find: any, data: z.output<this['put_validator']>, session?: ClientSession): Promise<z.output<ZodSchema>>;
    perform_upsert_and_side_effects(find: any, data: z.output<this['put_validator']>, session?: ClientSession): Promise<z.output<ZodSchema>>;
    perform_delete_and_side_effects(find: any, session?: ClientSession): Promise<z.output<ZodSchema>>;
    array_perform_create(array_key: string, find: any, data: any, additional_updates?: {
        [key: string]: any;
    }, session?: ClientSession): Promise<z.output<ZodSchema>>;
}
export {};
