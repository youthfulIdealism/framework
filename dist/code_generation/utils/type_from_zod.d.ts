import { z } from "zod/v4";
import { validator_group } from '../../utils/zod_loop_seperator.js';
export declare function type_from_zod(zod_definition: z.ZodType): string[];
export declare function parse_zod(zod_definition: z.ZodType, indent_level: number, loop_detector: Map<any, validator_group>, skip_once?: z.core.$ZodTypeDef): string[];
