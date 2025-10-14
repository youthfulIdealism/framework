import * as z from "zod/v4";
import { mongoose_from_zod, schema_from_zod } from "./utils/mongoose_from_zod.js";
import mongoose, { Collection, Model, ObjectId } from "mongoose";
import { F_Security_Model } from "./F_Security_Models/F_Security_Model.js";
import { query_validator_from_zod } from "./utils/query_validator_from_zod.js";

export type CollectionType<Col extends F_Collection<ID, Val>, ID extends string, Val extends z.ZodObject> = z.output<Col['validator']>;

export type F_Layer<Collection_ID extends string, ZodSchema extends z.ZodObject> = {
    layers: string[],
    security_models: F_Security_Model<Collection_ID, ZodSchema>[]
}

export class F_Collection<Collection_ID extends string, ZodSchema extends z.ZodObject> {
    collection_id: Collection_ID;
    collection_name_plural: string;
    validator: ZodSchema;
    mongoose_schema: any;
    mongoose_model: Model<z.infer<ZodSchema>>;
    
    query_validator_server: z.ZodType;
    query_validator_client: z.ZodType;
    put_validator: z.ZodType;
    post_validator: z.ZodType;
    is_compiled: boolean;

    access_layers: F_Layer<Collection_ID, ZodSchema>[];
    create_hooks: ((session: mongoose.mongo.ClientSession, created_document: z.output<ZodSchema>) => Promise<void>)[];
    update_hooks: ((session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>)[];
    post_create_hooks: ((created_document: z.output<ZodSchema>) => Promise<void>)[];
    post_update_hooks: ((created_document: z.output<ZodSchema>) => Promise<void>)[];

    constructor(collection_name: Collection_ID, collection_name_plural: string, validator: ZodSchema){
        this.collection_id = collection_name;
        this.collection_name_plural = collection_name_plural;
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
        this.create_hooks = [];
        this.update_hooks = [];
        this.post_create_hooks = [];
        this.post_update_hooks = [];
    }

    add_layers(layers: string[], security_models: F_Security_Model<Collection_ID, ZodSchema>[], is_layer_owner = false){
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
    add_create_hook(hook: (session: mongoose.mongo.ClientSession, created_document: z.output<ZodSchema>) => Promise<void>): void {
        this.create_hooks.push(hook);
    }

    /**
     * Adds code that runs in a transaction when the document is being updated. If you want side-effect code
     * that doesn't DIRECTLY pertain to the database update operation, use the post-update hook instead.
     */
    add_update_hook(hook: (session: mongoose.mongo.ClientSession, updated_document: z.output<ZodSchema>) => Promise<void>): void {
        this.update_hooks.push(hook);
    }

    add_post_create_hook(hook: (created_document: z.output<ZodSchema>) => Promise<void>): void {
        this.post_create_hooks.push(hook);
    }

    add_post_update_hook(hook: (updated_document: z.output<ZodSchema>) => Promise<void>): void {
        this.post_update_hooks.push(hook);
    }

    // TODO: write tests for this
    async mongoose_create(data: z.output<ZodSchema>): Promise<z.output<ZodSchema>> {
        let created_document_data;

        // if we have any create hooks, run the create operation in a transaction
        if(this.create_hooks.length > 0){
            await mongoose.connection.transaction(async (session) => {
                // create the document
                let [created_document] = await this.mongoose_model.create([data], {session: session, lean: true});
                created_document_data = created_document;

                // run each hook one-by-one because running them in parallell is verboten
                // https://mongoosejs.com/docs/transactions.html
                for(let hook of this.create_hooks){
                    await hook(session, created_document);
                }
            });
        } else {// if we don't have any post create hooks, run the create operation normally
            created_document_data = await this.mongoose_model.create(data);
        }

        // run the post-create hooks, which should not make DB changes.
        for(let hook of this.post_create_hooks) {
            try {
                await hook(created_document_data);
            } catch(err) {
                console.error(`Error in ${this.collection_id} post_create_hook:`)
                console.error(err);
            }
            
        }

        return created_document_data;
    }

    // TODO: write tests for this
    async mongoose_update(find: any, data: z.output<ZodSchema>): Promise<z.output<ZodSchema>> {
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
                console.error(`Error in ${this.collection_id} post_update_hook:`)
                console.error(err);
            }
        }

        //@ts-expect-error
        return update_document_data;
    }
}