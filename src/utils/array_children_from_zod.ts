import z from "zod/v4";
import { find_loops, validator_group } from './zod_loop_seperator.js'

export function array_children_from_zod(zod_definition: z.ZodObject, loop_detector?: Map<any, validator_group>, built_map?: Map<string, z.ZodObject>, prefix: string = ''): Map<string, z.ZodObject> {
    let loops = loop_detector ?? find_loops(zod_definition as z.ZodType);
    let results = built_map ?? new Map<string, z.ZodObject>();

    for(let [key, value] of Object.entries(zod_definition.shape)){
        if(loops.has(value._zod.def)){ continue; }
        let real_value = penetrate_nullable_optional(value);
        switch (real_value._zod.def.type) {
            case "object":
                array_children_from_zod(real_value as z.ZodObject, loop_detector, results, prefix.length > 0 ? `${prefix}.${key}` : key)
                break;
            case "array":
                //@ts-ignore
                let element = penetrate_nullable_optional((real_value as z.ZodArray).element);
                if(element._zod.def.type === 'object') {
                    let objdef = element._zod.def as z.core.$ZodObjectDef;
                    if(objdef.shape._id){
                        results.set(prefix.length > 0 ? `${prefix}.${key}` : key,  element as z.ZodObject);
                    }
                }
                break;
            default:
                break;
        }

    }
    return results;
}

export function penetrate_nullable_optional(zod_definition: z.ZodType): z.ZodType {
    let current = zod_definition;
    while(['nullable', 'optional'].includes(current._zod.def.type)) {
        //@ts-ignore
        current = current._zod.def.innerType;
    }
    return current;
}