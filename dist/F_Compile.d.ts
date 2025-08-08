import * as z from "zod/v4/core";
import { F_Collection } from "./F_Collection.js";
import { Router } from "express";
export declare function compile<Collection_ID extends string, ZodSchema extends z.$ZodType>(app: Router, collection: F_Collection<Collection_ID, ZodSchema>, api_prefix: string): void;
