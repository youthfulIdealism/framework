import * as z from 'zod/v4'
import { F_Collection } from './F_Collection.js';
import { compile, to_openapi } from './F_Compile.js'
import { Router } from 'express';
import { createDocument } from 'zod-openapi';


export class F_Collection_Registry<Collections = {}> {
    collections: Collections;



    constructor() {
        this.collections = {} as Collections;
    }

    register<Collection_ID extends string, ZodSchema extends z.ZodType>(collection: F_Collection<Collection_ID, ZodSchema>): F_Collection_Registry<Collections & { [key in Collection_ID]: F_Collection<Collection_ID, ZodSchema>}>{
        let collections = this.collections as Collections & { [key in Collection_ID]: F_Collection<Collection_ID, ZodSchema>};
        // @ts-expect-error
        collections[collection.collection_id] = collection;
        return this as F_Collection_Registry<Collections & { [key in Collection_ID]: F_Collection<Collection_ID, ZodSchema>}>;
    }

    compile(app: Router, api_prefix: string) {
        for(let collection of Object.values(this.collections)){
            compile(app, collection, api_prefix)
        }
    }

    to_openapi(api_prefix: string): string {
        return to_openapi(Object.values(this.collections), api_prefix);
    }
    
}