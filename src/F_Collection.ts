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
    collection_id: Collection_ID;
    validator: ZodSchema;
    mongoose_schema: any;
    mongoose_model: Model<z.infer<ZodSchema>>;
    
    query_validator_server: z.ZodType;
    query_validator_client: z.ZodType;
    put_validator: z.ZodType;
    post_validator: z.ZodType;
    is_compiled: boolean;

    access_layers: F_Layer<Collection_ID, ZodSchema>[];

    constructor(collection_name: Collection_ID, validator: ZodSchema){
        this.collection_id = collection_name;
        this.validator = validator;
        this.mongoose_schema = schema_from_zod(validator);
        this.mongoose_model = mongoose_from_zod(collection_name, validator);
        // TODO: validate that the model doesn't use any fields that have special meaning in the query validator; for example: [param]_gt, [param]_in, sort,
        //@ts-ignore
        this.query_validator_server = query_validator_from_zod(validator, 'server');
        this.query_validator_client = query_validator_from_zod(validator, 'client');
        // TODO: we can make this more closely match the mongoDB PUT operation and allow updates to eg array.3.element fields
        this.put_validator = validator.partial();
        this.post_validator = Object.hasOwn(this.validator._zod.def.shape, '_id') ? validator.partial({_id: true}) : validator;
        this.access_layers = [];
        this.is_compiled = false;
    }

    add_layers(layers: string[], security_models: F_Security_Model<Collection_ID, ZodSchema>[], is_layer_owner = false){
        if(this.is_compiled){ throw new Error(`Manipulating a model post-compilation doesn't work.`); }
        this.access_layers.push({
            layers: layers,
            security_models: security_models
        });
    }
}