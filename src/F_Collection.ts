import * as z from "zod/v4";
import { mongoose_from_zod, schema_from_zod } from "./utils/mongoose_from_zod.js";
import { Model } from "mongoose";
import { F_Security_Model } from "./F_Security_Models/F_Security_Model.js";
import { query_validator_from_zod } from "./utils/query_validator_from_zod.js";
import ky, { SearchParamsOption } from 'ky';

export type F_Layer<Collection_ID extends string, ZodSchema extends z.ZodObject> = {
    layers: string[],
    security_models: F_Security_Model<Collection_ID, ZodSchema>[]
}

export class F_Collection<Collection_ID extends string, ZodSchema extends z.ZodObject> {
    schema: ZodSchema;
    collection_id: Collection_ID;
    model: Model<z.infer<ZodSchema>>;
    access_layers: F_Layer<Collection_ID, ZodSchema>[];
    raw_schema: any;
    query_schema: z.ZodType;
    put_schema: z.ZodType;
    post_schema: z.ZodType;
    compiled: boolean;

    constructor(collection_name: Collection_ID, schema: ZodSchema, mode: 'server' | 'client' = 'server'){
        this.collection_id = collection_name;
        this.schema = schema;
        this.raw_schema = schema_from_zod(schema);
        this.model = mongoose_from_zod(collection_name, schema);
        // TODO: validate that the model doesn't use any fields that have special meaning in the query validator; for example: [param]_gt, [param]_in, sort,
        //@ts-ignore
        this.query_schema = query_validator_from_zod(schema, mode);
        // TODO: we can make this more closely match the mongoDB PUT operation and allow updates to eg array.3.element fields
        this.put_schema = schema.partial();
        this.post_schema = Object.hasOwn(this.schema._zod.def.shape, '_id') ? schema.partial({_id: true}) : schema;
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