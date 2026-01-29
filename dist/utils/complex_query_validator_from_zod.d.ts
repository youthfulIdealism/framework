import { z } from "zod/v4";
type Mode = 'client' | 'server';
export declare function complex_query_validator_from_zod(zod_definition: z.ZodObject, mode?: Mode): z.ZodUnion<readonly [z.ZodObject<{
    $and: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<any, z.core.$strip>, z.ZodObject<{
        $or: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<any, z.core.$strip>, z.ZodObject<any, z.core.$strip>, z.ZodObject<{
            [x: string]: any;
        }, z.core.$strip>]>>;
    }, z.core.$strip>, z.ZodObject<{
        [x: string]: any;
    }, z.core.$strip>]>>;
}, z.core.$strip>, z.ZodObject<{
    $or: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        $and: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<any, z.core.$strip>, z.ZodObject<any, z.core.$strip>, z.ZodObject<{
            [x: string]: any;
        }, z.core.$strip>]>>;
    }, z.core.$strip>, z.ZodObject<any, z.core.$strip>, z.ZodObject<{
        [x: string]: any;
    }, z.core.$strip>]>>;
}, z.core.$strip>]>;
export {};
