import * as z from "zod/v4";
import { Router } from "express";
import { F_Collection } from "./F_Collection.js";
import { F_Collection_Registry } from "./F_Collection_Registry.js";
export declare function compile<Collection_ID extends string, ZodSchema extends z.ZodObject>(app: Router, collection: F_Collection<Collection_ID, ZodSchema>, api_prefix: string, collection_registry: F_Collection_Registry<any>): void;
