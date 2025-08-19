import * as z from "zod/v4";
import { Router } from "express";
import { F_Collection } from "./F_Collection.js";
export declare function compile<Collection_ID extends string, ZodSchema extends z.ZodType>(app: Router, collection: F_Collection<Collection_ID, ZodSchema>, api_prefix: string): void;
export declare function to_openapi<Collection_ID extends string, ZodSchema extends z.ZodType>(collections: F_Collection<Collection_ID, ZodSchema>[], api_prefix: string): string;
