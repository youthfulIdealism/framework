import { z } from "zod/v4";
import mongoose from "mongoose";
import { validator_group } from './zod_loop_seperator.js';
export declare const z_mongodb_id: z.ZodCustom<string, string>;
export declare const z_mongodb_id_optional: z.ZodCustom<string, string>;
export declare const z_mongodb_id_nullable: z.ZodCustom<string, string>;
export declare function mongoose_from_zod<T>(schema_name: string, zod_definition: z.core.$ZodType, database?: typeof mongoose): mongoose.Model<T, {}, {}, {}, mongoose.IfAny<T, any, mongoose.Document<unknown, {}, T, {}, {}> & (mongoose.Require_id<T> extends infer T_1 ? T_1 extends mongoose.Require_id<T> ? T_1 extends {
    __v?: infer U;
} ? T_1 : T_1 & {
    __v: number;
} : never : never)>, any>;
export declare function schema_from_zod(zod_definition: z.core.$ZodType): any;
export declare function schema_entry_from_zod(zod_definition: z.ZodType, loop_detector: Map<any, validator_group>): any;
