import * as z from "zod/v4";
import { mongoose_schema_from_zod, schema_from_zod } from "./utils/mongoose_schema_from_zod.js";
import mongoose, { ClientSession, Collection, Model, ObjectId } from "mongoose";
import { F_Security_Model } from "./F_Security_Models/F_Security_Model.js";
import { query_validator_from_zod } from "./utils/query_validator_from_zod.js";
import { array_children_from_zod } from "./utils/array_children_from_zod.js";
import { complex_query_validator_from_zod } from "./utils/complex_query_validator_from_zod.js";

export type CollectionType<Col extends F_Collection<string, Validator>, Validator extends z.ZodObject> = z.output<Col['validator']>;

export type F_Layer<Collection_ID extends string, ZodSchema extends z.ZodObject> = {
    layers: string[],
    security_models: F_Security_Model<Collection_ID, ZodSchema>[]
}

// Depth counter for Array_Child_Paths, so recursive schemas don't make the compiler recurse forever.
type Prev_Depth = [never, 0, 1, 2, 3, 4, 5];

/**
 * Every dotted path to an array child of T: an array of objects that have an _id, reachable only through nested
 * objects. This mirrors the runtime rules of array_children_from_zod.
 */
export type Array_Child_Paths<T, Depth extends number = 5> = [Depth] extends [never] ? never : {
    [K in keyof T & string]-?:
        NonNullable<T[K]> extends readonly (infer E)[]
            ? ('_id' extends keyof NonNullable<E> ? K : never) // _id may be optional, as in array_children_from_zod
        : NonNullable<T[K]> extends Date ? never
        : NonNullable<T[K]> extends object
            ? `${K}.${Array_Child_Paths<NonNullable<T[K]>, Prev_Depth[Depth]>}`
        : never
}[keyof T & string];

/**
 * The type of a single element of the array at dotted path P within T.
 */
export type Array_Child_At<T, P extends string> =
    P extends `${infer Head}.${infer Rest}`
        ? Head extends keyof T ? Array_Child_At<NonNullable<T[Head]>, Rest> : never
        : P extends keyof T
            ? (NonNullable<T[P]> extends readonly (infer E)[] ? NonNullable<E> : never)
            : never;

/**
 * array_item is the array element that was created/updated/deleted. parent_document is the full document that
 * contains the array (the post-operation state). P is the array child's dotted path; when it is a concrete path,
 * array_item is typed as that array's element. When P is just string (as in the internal hook maps, which hold
 * hooks for many different paths), array_item is any.
 */
type Array_Item_Type<ZodSchema extends z.ZodObject, P extends string> = string extends P ? any : Array_Child_At<z.output<ZodSchema>, P>;
export type Array_Item_Hook<ZodSchema extends z.ZodObject, P extends string = string> = (session: mongoose.mongo.ClientSession, array_item: Array_Item_Type<ZodSchema, P>, parent_document: z.output<ZodSchema>) => Promise<void>;
export type Array_Item_Post_Hook<ZodSchema extends z.ZodObject, P extends string = string> = (array_item: Array_Item_Type<ZodSchema, P>, parent_document: z.output<ZodSchema>) => Promise<void>;

export type Array_Item_Delete_Hook<ZodSchema extends z.ZodObject> = (session: mongoose.mongo.ClientSession, deleted_item_id: string, parent_document: z.output<ZodSchema>) => Promise<void>;
export type Array_Item_Post_Delete_Hook<ZodSchema extends z.ZodObject> = (deleted_item_id: string, parent_document: z.output<ZodSchema>) => Promise<void>;

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

    array_item_create_hooks: Map<string, Array_Item_Hook<ZodSchema>[]>;
    array_item_update_hooks: Map<string, Array_Item_Hook<ZodSchema>[]>;
    array_item_delete_hooks: Map<string, Array_Item_Delete_Hook<ZodSchema>[]>;
    array_item_post_create_hooks: Map<string, Array_Item_Post_Hook<ZodSchema>[]>;
    array_item_post_update_hooks: Map<string, Array_Item_Post_Hook<ZodSchema>[]>;
    array_item_post_delete_hooks: Map<string, Array_Item_Post_Delete_Hook<ZodSchema>[]>;

    constructor(collection_name: Collection_ID, collection_name_plural: string, validator: ZodSchema, database: typeof mongoose = mongoose){
        this.collection_id = collection_name;
        this.collection_name_plural = collection_name_plural;
        this.validator = validator;
        this.mongoose_schema = schema_from_zod(validator);
        this.mongoose_model = mongoose_schema_from_zod(collection_name, validator, database);
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

        this.array_item_create_hooks = new Map();
        this.array_item_update_hooks = new Map();
        this.array_item_delete_hooks = new Map();
        this.array_item_post_create_hooks = new Map();
        this.array_item_post_update_hooks = new Map();
        this.array_item_post_delete_hooks = new Map();
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
     * Adds code that runs in a transaction when an array child is being added. If you want side-effect code
     * that doesn't DIRECTLY pertain to the database update operation, use the post-update hook instead.
     * 
     * This IS NOT CALLED during document creation or document updating. IT IS ONLY CALLED VIA THE ARRAY UPDATE ENDPOINTS.
     */
    array_on_create<ArrayKey extends Array_Child_Paths<z.output<ZodSchema>>>(key: ArrayKey, hook: Array_Item_Hook<ZodSchema, ArrayKey>): void {
        if(!this.array_item_create_hooks.has(key)){this.array_item_create_hooks.set(key, []);}
        this.array_item_create_hooks.get(key).push(hook);
    }

    /**
     * Adds code that runs in a transaction when an array child is being updated. If you want side-effect code
     * that doesn't DIRECTLY pertain to the database update operation, use the post-update hook instead.
     * 
     * This IS NOT CALLED during document creation or document updating. IT IS ONLY CALLED VIA THE ARRAY UPDATE ENDPOINTS.
     */
    array_on_update<ArrayKey extends Array_Child_Paths<z.output<ZodSchema>>>(key: ArrayKey, hook: Array_Item_Hook<ZodSchema, ArrayKey>): void {
        if(!this.array_item_update_hooks.has(key)){this.array_item_update_hooks.set(key, []);}
        this.array_item_update_hooks.get(key).push(hook);
    }

    /**
     * Adds code that runs in a transaction when an array child is being deleted. If you want side-effect code
     * that doesn't DIRECTLY pertain to the database update operation, use the post-update hook instead.
     *
     * The hook receives the _id of the deleted item, not the item itself.
     *
     * This IS NOT CALLED during document creation or document updating. IT IS ONLY CALLED VIA THE ARRAY UPDATE ENDPOINTS.
     */
    array_on_delete<ArrayKey extends Array_Child_Paths<z.output<ZodSchema>>>(key: ArrayKey, hook: Array_Item_Delete_Hook<ZodSchema>): void {
        if(!this.array_item_delete_hooks.has(key)){this.array_item_delete_hooks.set(key, []);}
        this.array_item_delete_hooks.get(key).push(hook);
    }

    /**
     * Adds code that runs after an array child is created. If this code fails, no error is thrown--a message is merely
     * printed to the console. This means that the code needs to contain any error-handlers within itself.
     * 
     * This IS NOT CALLED during document creation or document updating. IT IS ONLY CALLED VIA THE ARRAY UPDATE ENDPOINTS.
     */
    array_post_create<ArrayKey extends Array_Child_Paths<z.output<ZodSchema>>>(key: ArrayKey, hook: Array_Item_Post_Hook<ZodSchema, ArrayKey>): void {
        if(!this.array_item_post_create_hooks.has(key)){this.array_item_post_create_hooks.set(key, []);}
        this.array_item_post_create_hooks.get(key).push(hook);
    }

    /**
     * Adds code that runs after an array child is created. If this code fails, no error is thrown--a message is merely
     * printed to the console. This means that the code needs to contain any error-handlers within itself.
     * 
     * This IS NOT CALLED during document creation or document updating. IT IS ONLY CALLED VIA THE ARRAY UPDATE ENDPOINTS.
     */
    array_post_update<ArrayKey extends Array_Child_Paths<z.output<ZodSchema>>>(key: ArrayKey, hook: Array_Item_Post_Hook<ZodSchema, ArrayKey>): void {
        if(!this.array_item_post_update_hooks.has(key)){this.array_item_post_update_hooks.set(key, []);}
        this.array_item_post_update_hooks.get(key).push(hook);
    }

    /**
     * Adds code that runs after an array child is created. If this code fails, no error is thrown--a message is merely
     * printed to the console. This means that the code needs to contain any error-handlers within itself.
     *
     * The hook receives the _id of the deleted item, not the item itself.
     *
     * This IS NOT CALLED during document creation or document updating. IT IS ONLY CALLED VIA THE ARRAY UPDATE ENDPOINTS.
     */
    array_post_delete<ArrayKey extends Array_Child_Paths<z.output<ZodSchema>>>(key: ArrayKey, hook: Array_Item_Post_Delete_Hook<ZodSchema>): void {
        if(!this.array_item_post_delete_hooks.has(key)){this.array_item_post_delete_hooks.set(key, []);}
        this.array_item_post_delete_hooks.get(key).push(hook);
    }

    /**
     * //TODO: Write tests for this
     * Runs both a create operation and any side-effects added by the on_create method within a mongodb transaction.
     * Then, performs any side-effects added by the after_create method.
     * 
     * If there are no side-effects specified by the on_create method, runs a normal non-transaction create to avoid
     * the performance impacts of a transaction.
     */
    async perform_create_and_side_effects(data: z.output<this['post_validator']>, session?: ClientSession): Promise<z.output<ZodSchema>> {
        let created_document_data;

        // if we have any create hooks, run the create operation in a transaction
        if(this.create_hooks.length > 0 || session){
            await create_or_use_session(async (session) => {
                // create the document
                //@ts-expect-error
                let [created_document] = await this.mongoose_model.create([data], {session: session, lean: true});
                created_document_data = created_document;

                // run each hook one-by-one because running them in parallell is verboten
                // https://mongoosejs.com/docs/transactions.html
                for(let hook of this.create_hooks){
                    await hook(session, created_document);
                }
            }, session);
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
    async perform_update_and_side_effects(find: any, data: z.output<this['put_validator']>, session?: ClientSession): Promise<z.output<ZodSchema>> {
        let update_document_data;

        // if we have any update hooks, run the update operation in a transaction
        if(this.update_hooks.length > 0 || session){
            await create_or_use_session(async (session) => {
                // update the document
                let updated_document = await this.mongoose_model.findOneAndUpdate(find, data, {returnDocument: 'after', session: session, lean: true})
                if(!updated_document){ return; }
                update_document_data = updated_document;

                // it's possible for the update to fail due to security adding a parameter
                // that prevents any update from occurring. Only perform the hooks if the
                // update went through.
                if(update_document_data){
                    // run each hook one-by-one because running them in parallell is verboten
                    // https://mongoosejs.com/docs/transactions.html
                    for(let hook of this.update_hooks){
                        //@ts-expect-error
                        await hook(session, updated_document);
                    }
                }
                
            }, session);
        } else {// if we don't have any post update hooks, run the update operation normally
            update_document_data = await this.mongoose_model.findOneAndUpdate(find, data, {returnDocument: 'after', lean: true})
        }
        
        // it's possible for the update to fail due to security adding a parameter
        // that prevents any update from occurring. Only perform the hooks if the
        // update went through.
        if(update_document_data){
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
        }

        //@ts-expect-error
        return update_document_data;
    }

    /**
     * //TODO: Write tests for this
     * Runs a findOneAndUpdate with upsert: true. If the upsert created a document, runs the side-effects added by
     * on_create and after_create; if it updated an existing document, runs the side-effects added by on_update
     * and after_update.
     *
     * If there are no side-effects specified by the on_create or on_update methods, runs a normal non-transaction
     * upsert to avoid the performance impacts of a transaction.
     */
    async perform_upsert_and_side_effects(find: any, data: z.output<this['put_validator']>, session?: ClientSession): Promise<z.output<ZodSchema>> {
        let upserted_document_data;
        let was_created = false;

        // we don't know whether this will be a create or an update until it runs, so use a transaction if either has hooks
        if(this.create_hooks.length > 0 || this.update_hooks.length > 0 || session){
            await create_or_use_session(async (session) => {
                // upsert the document
                let result = await this.mongoose_model.findOneAndUpdate(find, data, {returnDocument: 'after', upsert: true, includeResultMetadata: true, runValidators: true, session: session, lean: true});
                if(!result.value){ return; }
                upserted_document_data = result.value;
                was_created = !result.lastErrorObject?.updatedExisting;

                // run each hook one-by-one because running them in parallell is verboten
                // https://mongoosejs.com/docs/transactions.html
                for(let hook of (was_created ? this.create_hooks : this.update_hooks)){
                    await hook(session, upserted_document_data);
                }
            }, session);
        } else {// if we don't have any create or update hooks, run the upsert operation normally
            let result = await this.mongoose_model.findOneAndUpdate(find, data, {returnDocument: 'after', upsert: true, includeResultMetadata: true, runValidators: true, lean: true});
            upserted_document_data = result.value;
            was_created = !result.lastErrorObject?.updatedExisting;
        }

        if(upserted_document_data){
            // run the post-create or post-update hooks, which should not make DB changes.
            for(let hook of (was_created ? this.post_create_hooks : this.post_update_hooks)) {
                try {
                    await hook(upserted_document_data);
                } catch(err) {
                    console.error(`Error in ${this.collection_id} ${was_created ? 'after_create' : 'after_update'}:`)
                    console.error(err);
                }
            }
        }

        return upserted_document_data;
    }

    /**
     * //TODO: Write tests for this
     * Runs both a delete operation and any side-effects added by the on_delete method within a mongodb transaction.
     * Then, performs any side-effects added by the after_delete method.
     * 
     * If there are no side-effects specified by the on_delete method, runs a normal non-transaction delete to avoid
     * the performance impacts of a transaction.
     */
    async perform_delete_and_side_effects(find: any, session?: ClientSession): Promise<z.output<ZodSchema>> {
        let deleted_document_data;

        // if we have any delete hooks, run the delete operation in a transaction
        if(this.delete_hooks.length > 0 || session){
            await create_or_use_session(async (session) => {
                // delete the document
                let deleted_document = await this.mongoose_model.findOneAndDelete(find, {returnDocument: 'after', session: session, lean: true})
                deleted_document_data = deleted_document;

                if(deleted_document_data) {
                    // run each hook one-by-one because running them in parallell is verboten
                    // https://mongoosejs.com/docs/transactions.html
                    for(let hook of this.delete_hooks){
                        await hook(session, deleted_document);
                    }
                }
                
            }, session);
        } else {// if we don't have any post delete hooks, run the delete operation normally
            deleted_document_data = await this.mongoose_model.findOneAndDelete(find, {returnDocument: 'after', lean: true})
        }

        // run the post-delete hooks, which should not make DB changes.
        if(deleted_document_data) {
            for(let hook of this.post_delete_hooks) {
                try {
                    await hook(deleted_document_data);
                } catch(err) {
                    console.error(`Error in ${this.collection_id} after_delete:`)
                    console.error(err);
                }
            }
        }

        return deleted_document_data;
    }

    /**
     * //TODO: Write tests for this
     * Pushes a new item onto the array at array_key of the document matching find. Since this is an update to the
     * parent document, within a single mongodb transaction it runs the side-effects added by on_update, then the
     * side-effects added by array_on_create for that key. Then, performs the side-effects added by after_update,
     * then those added by array_post_create for that key.
     *
     * Array hooks receive both the newly created array item and the full parent document.
     *
     * additional_updates is merged into the update alongside the $push (e.g. updated_by / updated_at metadata).
     *
     * If there are no side-effects specified by on_update or array_on_create, runs a normal non-transaction
     * update to avoid the performance impacts of a transaction.
     *
     * Returns the full parent document after the push, or null if no document matched find.
     */
    async array_perform_create_and_side_effects(array_key: string, find: any, data: any, additional_updates: { [key: string]: any } = {}, session?: ClientSession): Promise<z.output<ZodSchema>> {
        let update: any = {
            ...additional_updates,
            $push: { [array_key]: data },
        };
        let hooks = this.array_item_create_hooks.get(array_key) ?? [];
        let post_hooks = this.array_item_post_create_hooks.get(array_key) ?? [];

        // performs the push, returning the post-push parent document and the pushed array item
        let run_operation = async (session?: ClientSession): Promise<{ updated_document: any, array_item: any }> => {
            let updated_document = await this.mongoose_model.findOneAndUpdate(find, update, {returnDocument: 'after', session: session, lean: true});
            if(!updated_document){ return { updated_document: updated_document, array_item: undefined }; }
            // findOneAndUpdate atomically returns the state immediately after its own $push, so the last
            // element is the pushed item.
            let array = array_at_path(updated_document, array_key);
            return { updated_document: updated_document, array_item: array?.[array.length - 1] };
        };

        let updated_document_data;
        let array_item;

        // NOTE: this deliberately inlines the logic of perform_update_and_side_effects rather than calling it with
        // our session, because that would run the after_update hooks inside our transaction, before it commits.
        if(this.update_hooks.length > 0 || hooks.length > 0 || session){
            await create_or_use_session(async (session) => {
                // reset in case mongoose retries this callback after a transient transaction error
                updated_document_data = undefined;
                array_item = undefined;

                let result = await run_operation(session);
                if(!result.updated_document){ return; }
                updated_document_data = result.updated_document;
                array_item = result.array_item;

                // run each hook one-by-one because running them in parallell is verboten
                // https://mongoosejs.com/docs/transactions.html
                for(let hook of this.update_hooks){
                    await hook(session, updated_document_data);
                }
                for(let hook of hooks){
                    await hook(session, array_item, updated_document_data);
                }
            }, session);
        } else {// if no hooks need a transaction, run the operation normally
            let result = await run_operation();
            updated_document_data = result.updated_document;
            array_item = result.array_item;
        }

        // it's possible for the operation to fail due to security adding a parameter
        // that prevents any update from occurring. Only perform the hooks if the
        // operation went through.
        if(updated_document_data){
            // run the post-update hooks, which should not make DB changes.
            for(let hook of this.post_update_hooks) {
                try {
                    await hook(updated_document_data);
                } catch(err) {
                    console.error(`Error in ${this.collection_id} after_update:`)
                    console.error(err);
                }
            }

            // run the array post hooks, which should not make DB changes.
            for(let hook of post_hooks) {
                try {
                    await hook(array_item, updated_document_data);
                } catch(err) {
                    console.error(`Error in ${this.collection_id} array_post_create (${array_key}):`)
                    console.error(err);
                }
            }
        }

        return updated_document_data;
    }

    /**
     * //TODO: Write tests for this
     * Replaces the array item with _id item_id in the array at array_key of the document matching find. Since this
     * is an update to the parent document, within a single mongodb transaction it runs the side-effects added by
     * on_update, then the side-effects added by array_on_update for that key. Then, performs the side-effects added
     * by after_update, then those added by array_post_update for that key.
     *
     * Array hooks receive both the updated array item and the full parent document.
     *
     * The item's _id is always kept as item_id, regardless of what data contains. additional_updates is merged into
     * the update alongside the $set (e.g. updated_by / updated_at metadata).
     *
     * If there are no side-effects specified by on_update or array_on_update, runs a normal non-transaction
     * update to avoid the performance impacts of a transaction.
     *
     * Returns the full parent document after the update, or null if no document matched find or the document
     * has no array item with _id item_id.
     */
    async array_perform_update_and_side_effects(array_key: string, find: any, item_id: string, data: any, additional_updates: { [key: string]: any } = {}, session?: ClientSession): Promise<z.output<ZodSchema>> {
        let update: any = {
            ...additional_updates,
            $set: { [`${array_key}.$`]: { ...data, _id: item_id } },
        };
        let hooks = this.array_item_update_hooks.get(array_key) ?? [];
        let post_hooks = this.array_item_post_update_hooks.get(array_key) ?? [];

        // requiring the item in find makes the operation a no-op (returning null) if the item doesn't exist, and is
        // what the positional $ operator matches against.
        find = { ...find, [`${array_key}._id`]: item_id };

        // performs the update, returning the post-update parent document and the updated array item
        let run_operation = async (session?: ClientSession): Promise<{ updated_document: any, array_item: any }> => {
            let updated_document = await this.mongoose_model.findOneAndUpdate(find, update, {returnDocument: 'after', session: session, lean: true});
            if(!updated_document){ return { updated_document: updated_document, array_item: undefined }; }
            let array_item = array_at_path(updated_document, array_key)?.find((element: any) => String(element?._id) === String(item_id));
            return { updated_document: updated_document, array_item: array_item };
        };

        let updated_document_data;
        let array_item;

        // NOTE: this deliberately inlines the logic of perform_update_and_side_effects rather than calling it with
        // our session, because that would run the after_update hooks inside our transaction, before it commits.
        if(this.update_hooks.length > 0 || hooks.length > 0 || session){
            await create_or_use_session(async (session) => {
                // reset in case mongoose retries this callback after a transient transaction error
                updated_document_data = undefined;
                array_item = undefined;

                let result = await run_operation(session);
                if(!result.updated_document){ return; }
                updated_document_data = result.updated_document;
                array_item = result.array_item;

                // run each hook one-by-one because running them in parallell is verboten
                // https://mongoosejs.com/docs/transactions.html
                for(let hook of this.update_hooks){
                    await hook(session, updated_document_data);
                }
                for(let hook of hooks){
                    await hook(session, array_item, updated_document_data);
                }
            }, session);
        } else {// if no hooks need a transaction, run the operation normally
            let result = await run_operation();
            updated_document_data = result.updated_document;
            array_item = result.array_item;
        }

        // it's possible for the operation to fail due to security adding a parameter
        // that prevents any update from occurring. Only perform the hooks if the
        // operation went through.
        if(updated_document_data){
            // run the post-update hooks, which should not make DB changes.
            for(let hook of this.post_update_hooks) {
                try {
                    await hook(updated_document_data);
                } catch(err) {
                    console.error(`Error in ${this.collection_id} after_update:`)
                    console.error(err);
                }
            }

            // run the array post hooks, which should not make DB changes.
            for(let hook of post_hooks) {
                try {
                    await hook(array_item, updated_document_data);
                } catch(err) {
                    console.error(`Error in ${this.collection_id} array_post_update (${array_key}):`)
                    console.error(err);
                }
            }
        }

        return updated_document_data;
    }

    /**
     * //TODO: Write tests for this
     * Removes the array item with _id item_id from the array at array_key of the document matching find. Since
     * this is an update to the parent document, within a single mongodb transaction it runs the side-effects added
     * by on_update, then the side-effects added by array_on_delete for that key. Then, performs the side-effects
     * added by after_update, then those added by array_post_delete for that key.
     *
     * Array hooks receive the _id of the deleted array item and the full parent document (after deletion).
     *
     * additional_updates is merged into the update alongside the $pull (e.g. updated_by / updated_at metadata).
     *
     * If there are no side-effects specified by on_update or array_on_delete, runs a normal non-transaction
     * update to avoid the performance impacts of a transaction.
     *
     * Returns the full parent document after the deletion, or null if no document matched find or the document
     * has no array item with _id item_id.
     */
    async array_perform_delete_and_side_effects(array_key: string, find: any, item_id: string, additional_updates: { [key: string]: any } = {}, session?: ClientSession): Promise<z.output<ZodSchema>> {
        let update: any = {
            ...additional_updates,
            $pull: { [array_key]: { _id: item_id } },
        };
        let hooks = this.array_item_delete_hooks.get(array_key) ?? [];
        let post_hooks = this.array_item_post_delete_hooks.get(array_key) ?? [];

        // requiring the item in find makes the operation a no-op (returning null) if the item doesn't exist.
        find = { ...find, [`${array_key}._id`]: item_id };

        let updated_document_data: any;

        if(this.update_hooks.length > 0 || hooks.length > 0 || session){
            await create_or_use_session(async (session) => {
                // reset in case mongoose retries this callback after a transient transaction error
                updated_document_data = undefined;

                let updated_document: any = await this.mongoose_model.findOneAndUpdate(find, update, {returnDocument: 'after', session: session, lean: true});
                if(!updated_document){ return; }
                updated_document_data = updated_document;

                // run each hook one-by-one because running them in parallell is verboten
                // https://mongoosejs.com/docs/transactions.html
                for(let hook of this.update_hooks){
                    await hook(session, updated_document);
                }
                for(let hook of hooks){
                    await hook(session, item_id, updated_document);
                }
            }, session);
        } else {// if no hooks need a transaction, run the operation normally
            updated_document_data = await this.mongoose_model.findOneAndUpdate(find, update, {returnDocument: 'after', lean: true});
        }

        // it's possible for the operation to fail due to security adding a parameter
        // that prevents any update from occurring. Only perform the hooks if the
        // operation went through.
        if(updated_document_data){
            // run the post-update hooks, which should not make DB changes.
            for(let hook of this.post_update_hooks) {
                try {
                    await hook(updated_document_data);
                } catch(err) {
                    console.error(`Error in ${this.collection_id} after_update:`)
                    console.error(err);
                }
            }

            // run the array post hooks, which should not make DB changes.
            for(let hook of post_hooks) {
                try {
                    await hook(item_id, updated_document_data);
                } catch(err) {
                    console.error(`Error in ${this.collection_id} array_post_delete (${array_key}):`)
                    console.error(err);
                }
            }
        }

        return updated_document_data;
    }
}

/**
 * Returns the array at the dotted path array_key within document, or undefined if there isn't one. Array child
 * paths only traverse nested objects (never other arrays), so a plain property walk is sufficient.
 */
function array_at_path(document: any, array_key: string): any[] | undefined {
    let array = array_key.split('.').reduce((current, key) => current?.[key], document);
    return Array.isArray(array) ? array : undefined;
}

async function create_or_use_session(callback: (session: ClientSession) => Promise<void>, session?: ClientSession, ) {
    if(session) {
        return await callback(session);
    } else {
       return await mongoose.connection.transaction(callback);
    }
}