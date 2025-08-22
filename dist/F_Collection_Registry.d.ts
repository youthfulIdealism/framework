import * as z from 'zod/v4';
import { F_Collection } from './F_Collection.js';
import { Router } from 'express';
export declare class F_Collection_Registry<Collections = {}> {
    collections: Collections;
    constructor();
    register<Collection_ID extends string, ZodSchema extends z.ZodObject>(collection: F_Collection<Collection_ID, ZodSchema>): F_Collection_Registry<Collections & {
        [key in Collection_ID]: F_Collection<Collection_ID, ZodSchema>;
    }>;
    compile(app: Router, api_prefix: string): void;
}
