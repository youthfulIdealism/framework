import { z } from "zod/v4";
export type validator_group = {
    handle: string;
    validator: z.ZodType;
    appearances: number;
};
export declare function is_validator_group(candidate: any): boolean;
export declare function find_loops(zod_definition: z.ZodType): Map<any, validator_group>;
