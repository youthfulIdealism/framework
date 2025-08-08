import * as z from "zod/v4/core";
import { mongoose_from_zod, schema_from_zod } from "./utils/mongoose_from_zod.js";
import { Model } from "mongoose";
import { F_Security_Model } from "./F_Security_Models/F_Security_Model.js";

export type F_Layer<Collection_ID extends string, ZodSchema extends z.$ZodType> = {
    layers: string[],
    security_models: F_Security_Model<Collection_ID, ZodSchema>[]
}

export class F_Collection<Collection_ID extends string, ZodSchema extends z.$ZodType> {

    collection_id: Collection_ID;
    model: Model<z.infer<ZodSchema>>;
    access_layers: F_Layer<Collection_ID, ZodSchema>[];
    raw_schema: any;
    compiled: boolean;

    constructor(collection_name: Collection_ID, schema: ZodSchema){
        this.collection_id = collection_name;
        this.raw_schema = schema_from_zod(schema);
        this.model = mongoose_from_zod(collection_name, schema);
        this.access_layers = [];
        this.compiled = false;
    }

    add_layers(layers: string[], security_models: F_Security_Model<Collection_ID, ZodSchema>[], is_layer_owner = false){
        if(this.compiled){ throw new Error(`Manipulating a model post-compilation doesn't work.`); }
        this.access_layers.push({
            layers: layers,
            security_models: security_models
        });
    }

    
}