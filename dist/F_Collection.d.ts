import * as z from "zod/v4/core";
import { Model } from "mongoose";
import { F_Security_Model } from "./F_Security_Models/F_Security_Model.js";
export type F_Layer<Collection_ID extends string, ZodSchema extends z.$ZodType> = {
    layers: string[];
    security_models: F_Security_Model<Collection_ID, ZodSchema>[];
};
export declare class F_Collection<Collection_ID extends string, ZodSchema extends z.$ZodType> {
    collection_id: Collection_ID;
    model: Model<z.infer<ZodSchema>>;
    access_layers: F_Layer<Collection_ID, ZodSchema>[];
    raw_schema: any;
    compiled: boolean;
    constructor(collection_name: Collection_ID, schema: ZodSchema);
    add_layers(layers: string[], security_models: F_Security_Model<Collection_ID, ZodSchema>[], is_layer_owner?: boolean): void;
}
