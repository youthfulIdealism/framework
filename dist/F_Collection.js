import { mongoose_from_zod, schema_from_zod } from "./utils/mongoose_from_zod.js";
import { query_validator_from_zod } from "./utils/query_validator_from_zod.js";
export class F_Collection {
    collection_id;
    model;
    access_layers;
    raw_schema;
    query_schema;
    put_schema;
    compiled;
    constructor(collection_name, schema) {
        this.collection_id = collection_name;
        this.raw_schema = schema_from_zod(schema);
        this.model = mongoose_from_zod(collection_name, schema);
        this.query_schema = query_validator_from_zod(schema);
        this.put_schema = schema.partial();
        this.access_layers = [];
        this.compiled = false;
    }
    add_layers(layers, security_models, is_layer_owner = false) {
        if (this.compiled) {
            throw new Error(`Manipulating a model post-compilation doesn't work.`);
        }
        this.access_layers.push({
            layers: layers,
            security_models: security_models
        });
    }
}
//# sourceMappingURL=F_Collection.js.map