import { mongoose_from_zod, schema_from_zod } from "./utils/mongoose_from_zod.js";
import mongoose from "mongoose";
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
    create_hooks;
    update_hooks;
    post_create_hooks;
    post_update_hooks;
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
        this.create_hooks = [];
        this.update_hooks = [];
        this.post_create_hooks = [];
        this.post_update_hooks = [];
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
    add_create_hook(hook) {
        this.create_hooks.push(hook);
    }
    add_update_hook(hook) {
        this.update_hooks.push(hook);
    }
    add_post_create_hook(hook) {
        this.post_create_hooks.push(hook);
    }
    add_post_update_hook(hook) {
        this.post_update_hooks.push(hook);
    }
    async mongoose_create(data) {
        let created_document_data;
        if (this.create_hooks.length > 0) {
            await mongoose.connection.transaction(async (session) => {
                let [created_document] = await this.mongoose_model.create([data], { session: session, lean: true });
                created_document_data = created_document;
                for (let hook of this.create_hooks) {
                    await hook(session, created_document);
                }
            });
        }
        else {
            created_document_data = await this.mongoose_model.create(data);
        }
        for (let hook of this.post_create_hooks) {
            try {
                await hook(created_document_data);
            }
            catch (err) {
                console.error(`Error in ${this.collection_id} post_create_hook:`);
                console.error(err);
            }
        }
        return created_document_data;
    }
    async mongoose_update(find, data) {
        let update_document_data;
        if (this.update_hooks.length > 0) {
            await mongoose.connection.transaction(async (session) => {
                let updated_document = await this.mongoose_model.findOneAndUpdate(find, data, { returnDocument: 'after', session: session, lean: true });
                update_document_data = updated_document;
                for (let hook of this.update_hooks) {
                    await hook(session, updated_document);
                }
            });
        }
        else {
            update_document_data = await this.mongoose_model.findOneAndUpdate(find, data, { returnDocument: 'after', lean: true });
        }
        for (let hook of this.post_update_hooks) {
            try {
                await hook(update_document_data);
            }
            catch (err) {
                console.error(`Error in ${this.collection_id} post_update_hook:`);
                console.error(err);
            }
        }
        return update_document_data;
    }
}
//# sourceMappingURL=F_Collection.js.map