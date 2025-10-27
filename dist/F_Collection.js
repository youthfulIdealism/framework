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
    delete_hooks;
    post_create_hooks;
    post_update_hooks;
    post_delete_hooks;
    constructor(collection_name, collection_name_plural, validator) {
        this.collection_id = collection_name;
        this.collection_name_plural = collection_name_plural;
        this.validator = validator;
        this.mongoose_schema = schema_from_zod(validator);
        this.mongoose_model = mongoose_from_zod(collection_name, validator);
        this.query_validator_server = query_validator_from_zod(validator, 'server');
        this.query_validator_client = query_validator_from_zod(validator, 'client');
        if (!Object.hasOwn(this.validator._zod.def.shape, '_id')) {
            throw new Error(`_id is a required field, because each collection is a mongoDB object.`);
        }
        if (this.validator._zod.def.shape._id.meta()?.framework_override_type !== 'mongodb_id') {
            throw new Error(`_id must be a mongoDB ID. Use the z_mongodb_id special field.`);
        }
        this.put_validator = validator.partial();
        this.post_validator = Object.hasOwn(this.validator._zod.def.shape, '_id') ? validator.partial({ _id: true }) : validator;
        this.access_layers = [];
        this.is_compiled = false;
        this.create_hooks = [];
        this.update_hooks = [];
        this.delete_hooks = [];
        this.post_create_hooks = [];
        this.post_update_hooks = [];
        this.post_delete_hooks = [];
    }
    add_layers(layers, security_models) {
        if (this.is_compiled) {
            throw new Error(`Manipulating a model post-compilation doesn't work.`);
        }
        this.access_layers.push({
            layers: layers,
            security_models: security_models
        });
    }
    on_create(hook) {
        this.create_hooks.push(hook);
    }
    on_update(hook) {
        this.update_hooks.push(hook);
    }
    on_delete(hook) {
        this.delete_hooks.push(hook);
    }
    after_create(hook) {
        this.post_create_hooks.push(hook);
    }
    after_update(hook) {
        this.post_update_hooks.push(hook);
    }
    after_delete(hook) {
        this.post_delete_hooks.push(hook);
    }
    async perform_create_and_side_effects(data) {
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
                console.error(`Error in ${this.collection_id} after_create:`);
                console.error(err);
            }
        }
        return created_document_data;
    }
    async perform_update_and_side_effects(find, data) {
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
                console.error(`Error in ${this.collection_id} after_update:`);
                console.error(err);
            }
        }
        return update_document_data;
    }
    async perform_delete_and_side_effects(find) {
        let deleted_document_data;
        if (this.update_hooks.length > 0) {
            await mongoose.connection.transaction(async (session) => {
                let deleted_document = await this.mongoose_model.findOneAndDelete(find, { returnDocument: 'after', session: session, lean: true });
                deleted_document_data = deleted_document;
                for (let hook of this.delete_hooks) {
                    await hook(session, deleted_document);
                }
            });
        }
        else {
            deleted_document_data = await this.mongoose_model.findOneAndDelete(find, { returnDocument: 'after', lean: true });
        }
        for (let hook of this.post_delete_hooks) {
            try {
                await hook(deleted_document_data);
            }
            catch (err) {
                console.error(`Error in ${this.collection_id} after_delete:`);
                console.error(err);
            }
        }
        return deleted_document_data;
    }
}
//# sourceMappingURL=F_Collection.js.map