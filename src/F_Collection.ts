import * as z from "zod/v4";
import { mongoose_from_zod, schema_from_zod } from "./utils/mongoose_from_zod.js";
import mongoose, { Collection, Model, ObjectId } from "mongoose";
import { F_Security_Model } from "./F_Security_Models/F_Security_Model.js";
import { query_validator_from_zod } from "./utils/query_validator_from_zod.js";
import { array_children_from_zod } from "./utils/array_children_from_zod.js";
import { complex_query_validator_from_zod } from "./utils/complex_query_validator_from_zod.js";

export type CollectionType<Col extends F_Collection<string, Validator>, Validator extends z.ZodObject> = z.output<Col['validator']>;

export type F_Layer<Collection_ID extends string, ZodSchema extends z.ZodObject> = {
    layers: string[],
    security_models: F_Security_Model<Collection_ID, ZodSchema>[]
}

type Partial_Mask = {_id: true};
type ZodPartial_Return_Type<T extends (arg: Partial_Mask) => any> = T extends (arg: Partial_Mask) => infer R ? R : any;

export class F_Collection<Collection_ID extends string, ZodSchema extends z.ZodObject> {
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
    // TODO: Come back and find a way to select the particular partial I want
    // instead of partialing the whole object.
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

    constructor(collection_name: Collection_ID, collection_name_plural: string, validator: ZodSchema, database: typeof mongoose = mongoose){
        this.collection_id = collection_name;
        this.collection_name_plural = collection_name_plural;
        this.validator = validator;
        this.mongoose_schema = schema_from_zod(validator);
        this.mongoose_model = mongoose_from_zod(collection_name, validator, database);
        this.query_validator_server = query_validator_from_zod(validator, 'server');
        this.query_validator_client = query_validator_from_zod(validator, 'client');
        this.advanced_query_validator_server = complex_query_validator_from_zod(validator, 'server').optional()
        this.advanced_query_validator_client = complex_query_validator_from_zod(validator, 'client').optional()
        // TODO: we can make this more closely match the mongoDB PUT operation and allow updates to eg array.3.element fields

        if(!Object.hasOwn(this.validator._zod.def.shape, '_id')){
            throw new Error(`_id is a required field, because each collection is a mongoDB object.`)
        }
        if(this.validator._zod.def.shape._id.meta()?.framework_override_type !== 'mongodb_id'){
            throw new Error(`_id must be a mongoDB ID. Use the z_mongodb_id special field.`)
        }

        this.array_children_map = array_children_from_zod(validator);

        // TODO: find a more elegant way to do this so that the types don't have a cow
        //@ts-ignore
        this.put_validator = validator.partial();
        // @ts-ignore
        this.post_validator = Object.hasOwn(this.validator._zod.def.shape, '_id') ? validator.partial({ _id: true }) : validator;

        this.array_children_post_map = new Map<string, z.ZodType>();
        Array.from(this.array_children_map.entries()).forEach((keyval: [string, z.ZodType]) => {
            let [key, value] = keyval;
            // @ts-ignore
            this.array_children_post_map.set(key, value.partial({ _id: true }));
        })

        this.access_layers = [];
        this.is_compiled = false;
        this.create_hooks = [];
        this.update_hooks = [];
        this.delete_hooks = [];
        this.post_create_hooks = [];
        this.post_update_hooks = [];
        this.post_delete_hooks = [];
    }

    /**
     * adds a logical point of access and the security models that define it. For example, given a
     * user who has several boxes, and each box has several items, the layers might look like:
     * 
     * collection_user.add_layers([], [new SecurityModelOfSomeKind()]); // users can be accessed through /api/user
     * collection_box.add_layers(['user'], [new SecurityModelOfSomeKind()]); // users can be accessed through /api/user/<user_id>/box
     * collection_item.add_layers(['user', 'box'], [new SecurityModelOfSomeKind()]); // users can be accessed through /api/user/<user_id>/box/<box_id>/item
     */
    add_layers(layers: string[], security_models: F_Security_Model<Collection_ID, ZodSchema>[]){
        if(this.is_compiled){ throw new Error(`Manipulating a model post-compilation doesn't work.`); }
        this.access_layers.push({
            layers: layers,
            security_models: security_models
        });
    }

    /**
     * Adds code that runs in a transaction when the document is being created. If you want side-effect code
     * that doesn't DIRECTLY pertain to the database create operation, use the post-create hook instead.
     */
    on_create(hook: (session: mongoose.mongo.ClientSession, created_document: z.output<ZodSchema>) => Promise<void>): void {
        this.create_hooks.push(hook);
    }

    /**
     * Adds code that runs in a transaction when the document is being updated. If you want side-effect code
     * that doesn't DIRECTLY pertain to the database update operation, use the post-update hook instead.
     */
    on_update(hook: (session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>): void {
        this.update_hooks.push(hook);
    }

    /**
     * Adds code that runs in a transaction when the document is being deleted. If you want side-effect code
     * that doesn't DIRECTLY pertain to the database delete operation, use the post-delete hook instead.
     */
    on_delete(hook: (session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>): void {
        this.delete_hooks.push(hook);
    }

    /**
     * Adds code that runs after a document is created. If this code fails, no error is thrown--a message is merely
     * printed to the console. This means that the code needs to contain any error-handlers within itself.
     */
    after_create(hook: (created_document: z.output<ZodSchema>) => Promise<void>): void {
        this.post_create_hooks.push(hook);
    }

    /**
     * Adds code that runs after a document is updated. If this code fails, no error is thrown--a message is merely
     * printed to the console. This means that the code needs to contain any error-handlers within itself.
     */
    after_update(hook: (updated_document: z.output<ZodSchema>) => Promise<void>): void {
        this.post_update_hooks.push(hook);
    }

    /**
     * Adds code that runs after a document is deleted. If this code fails, no error is thrown--a message is merely
     * printed to the console. This means that the code needs to contain any error-handlers within itself.
     */
    after_delete(hook: (deleted_document: z.output<ZodSchema>) => Promise<void>): void {
        this.post_delete_hooks.push(hook);
    }

    /**
     * //TODO: Write tests for this
     * Runs both a create operation and any side-effects added by the on_create method within a mongodb transaction.
     * Then, performs any side-effects added by the after_create method.
     * 
     * If there are no side-effects specified by the on_create method, runs a normal non-transaction create to avoid
     * the performance impacts of a transaction.
     */
    async perform_create_and_side_effects(data: z.output<this['post_validator']>): Promise<z.output<ZodSchema>> {
        let created_document_data;

        // if we have any create hooks, run the create operation in a transaction
        if(this.create_hooks.length > 0){
            await mongoose.connection.transaction(async (session) => {
                // create the document
                //@ts-expect-error
                let [created_document] = await this.mongoose_model.create([data], {session: session, lean: true});
                created_document_data = created_document;

                // run each hook one-by-one because running them in parallell is verboten
                // https://mongoosejs.com/docs/transactions.html
                for(let hook of this.create_hooks){
                    await hook(session, created_document);
                }
            });
        } else {// if we don't have any post create hooks, run the create operation normally
            //@ts-expect-error
            created_document_data = await this.mongoose_model.create(data);
        }

        // run the post-create hooks, which should not make DB changes.
        for(let hook of this.post_create_hooks) {
            try {
                await hook(created_document_data);
            } catch(err) {
                console.error(`Error in ${this.collection_id} after_create:`)
                console.error(err);
            }
            
        }

        return created_document_data;
    }

    /**
     * //TODO: Write tests for this
     * Runs both a update operation and any side-effects added by the on_update method within a mongodb transaction.
     * Then, performs any side-effects added by the after_update method.
     * 
     * If there are no side-effects specified by the on_update method, runs a normal non-transaction update to avoid
     * the performance impacts of a transaction.
     */
    async perform_update_and_side_effects(find: any, data: z.output<this['put_validator']>): Promise<z.output<ZodSchema>> {
        let update_document_data;

        // if we have any update hooks, run the update operation in a transaction
        if(this.update_hooks.length > 0){
            await mongoose.connection.transaction(async (session) => {
                // update the document
                let updated_document = await this.mongoose_model.findOneAndUpdate(find, data, {returnDocument: 'after', session: session, lean: true})
                update_document_data = updated_document;

                // run each hook one-by-one because running them in parallell is verboten
                // https://mongoosejs.com/docs/transactions.html
                for(let hook of this.update_hooks){
                    //@ts-expect-error
                    await hook(session, updated_document);
                }
            });
        } else {// if we don't have any post update hooks, run the update operation normally
            update_document_data = await this.mongoose_model.findOneAndUpdate(find, data, {returnDocument: 'after', lean: true})
        }

        // run the post-update hooks, which should not make DB changes.
        for(let hook of this.post_update_hooks) {
            try {
                //@ts-expect-error
                await hook(update_document_data);
            } catch(err) {
                console.error(`Error in ${this.collection_id} after_update:`)
                console.error(err);
            }
        }

        //@ts-expect-error
        return update_document_data;
    }

    /**
     * //TODO: Write tests for this
     * Runs both a delete operation and any side-effects added by the on_delete method within a mongodb transaction.
     * Then, performs any side-effects added by the after_delete method.
     * 
     * If there are no side-effects specified by the on_delete method, runs a normal non-transaction delete to avoid
     * the performance impacts of a transaction.
     */
    async perform_delete_and_side_effects(find: any): Promise<z.output<ZodSchema>> {
        let deleted_document_data;

        // if we have any update hooks, run the update operation in a transaction
        if(this.delete_hooks.length > 0){
            await mongoose.connection.transaction(async (session) => {
                // update the document
                let deleted_document = await this.mongoose_model.findOneAndDelete(find, {returnDocument: 'after', session: session, lean: true})
                deleted_document_data = deleted_document;

                // run each hook one-by-one because running them in parallell is verboten
                // https://mongoosejs.com/docs/transactions.html
                for(let hook of this.delete_hooks){
                    await hook(session, deleted_document);
                }
            });
        } else {// if we don't have any post update hooks, run the update operation normally
            deleted_document_data = await this.mongoose_model.findOneAndDelete(find, {returnDocument: 'after', lean: true})
        }

        // run the post-update hooks, which should not make DB changes.
        for(let hook of this.post_delete_hooks) {
            try {
                await hook(deleted_document_data);
            } catch(err) {
                console.error(`Error in ${this.collection_id} after_delete:`)
                console.error(err);
            }
        }

        return deleted_document_data;
    }
}