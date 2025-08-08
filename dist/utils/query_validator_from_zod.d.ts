import { z } from "zod/v4";
export declare function query_validator_from_zod(zod_definition: z.ZodObject): z.ZodObject<{
    [x: string]: any;
}, z.core.$strict>;
