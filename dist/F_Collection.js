import { mongoose_from_zod, schema_from_zod } from "./utils/mongoose_from_zod.js";
import { query_validator_from_zod } from "./utils/query_validator_from_zod.js";
export class F_Collection {
    collection_id;
    collection_name_plural;
    validator;
    mongoose_schema;
    mongoose_model;
    query_validator_server;
    query_validator_client;
    put_validator;
    post_validator;
    is_compiled;
    access_layers;
    constructor(collection_name, collection_name_plural, validator) {
        this.collection_id = collection_name;
        this.collection_name_plural = collection_name_plural;
        this.validator = validator;
        this.mongoose_schema = schema_from_zod(validator);
        this.mongoose_model = mongoose_from_zod(collection_name, validator);
        this.query_validator_server = query_validator_from_zod(validator, 'server');
        this.query_validator_client = query_validator_from_zod(validator, 'client');
        this.put_validator = validator.partial();
        this.post_validator = Object.hasOwn(this.validator._zod.def.shape, '_id') ? validator.partial({ _id: true }) : validator;
        this.access_layers = [];
        this.is_compiled = false;
    }
    add_layers(layers, security_models, is_layer_owner = false) {
        if (this.is_compiled) {
            throw new Error(`Manipulating a model post-compilation doesn't work.`);
        }
        this.access_layers.push({
            layers: layers,
            security_models: security_models
        });
    }
}
//# sourceMappingURL=F_Collection.js.map