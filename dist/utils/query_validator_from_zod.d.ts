import { z } from "zod/v4";
type Mode = 'client' | 'server';
export declare function query_validator_from_zod(zod_definition: z.ZodObject, mode?: Mode): z.ZodObject<{
    [x: string]: any;
}, z.core.$strict>;
export {};
