import { z } from "zod/v4";
import mongoose from "mongoose";
export declare const magic_values: z.core.$ZodRegistry<{
    override_type: string;
}, z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
export declare const z_mongodb_id: z.ZodCustom<string, string>;
export declare function mongoose_from_zod<T>(schema_name: string, zod_definition: z.core.$ZodType): mongoose.Model<T, {}, {}, {}, mongoose.IfAny<T, any, mongoose.Document<unknown, {}, T, {}, {}> & (mongoose.Require_id<T> extends infer T_1 ? T_1 extends mongoose.Require_id<T> ? T_1 extends {
    __v?: infer U;
} ? T_1 : T_1 & {
    __v: number;
} : never : never)>, any>;
export declare function schema_from_zod(zod_definition: z.core.$ZodType): any;
export declare function schema_entry_from_zod(zod_definition: z.ZodType, loop_detector?: Set<any>): any;
