import * as z from "zod/v4";
import { Model } from "mongoose";
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
    constructor(collection_name: Collection_ID, collection_name_plural: string, validator: ZodSchema);
    add_layers(layers: string[], security_models: F_Security_Model<Collection_ID, ZodSchema>[], is_layer_owner?: boolean): void;
}
