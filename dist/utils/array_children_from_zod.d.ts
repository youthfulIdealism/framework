import z from "zod/v4";
import { validator_group } from './zod_loop_seperator.js';
export declare function array_children_from_zod(zod_definition: z.ZodObject, loop_detector?: Map<any, validator_group>, built_map?: Map<string, z.ZodObject>, prefix?: string): Map<string, z.ZodObject>;
