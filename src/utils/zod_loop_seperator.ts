import { z } from "zod/v4"


export type validator_group = {
    handle: string,
    validator: z.ZodType,
    def: z.core.$ZodType
    appearances: number,
    meta: {[key: string]: any}
}

export function is_validator_group(candidate: any): boolean {
    return typeof candidate.handle === 'string' && candidate.validator;
}

export function find_loops(zod_definition: z.ZodType){
    let potential_loops = discover_loops(zod_definition);
    for(let [key, value] of potential_loops.entries()){
        if(value.appearances <= 1){ potential_loops.delete(key); }
    }
    return potential_loops;
}

function discover_loops(
    zod_definition: z.ZodType,
    validator_groups: Map<any, validator_group> = new Map()){
    if(!zod_definition) {
        console.error('ISSUE');
        console.error(zod_definition);
    }

    switch (zod_definition._zod.def.type) {
        case "object":
            parse_object(zod_definition as z.ZodObject,  validator_groups);
            break;
        case "array" :
            //@ts-expect-error
            discover_loops(zod_definition._zod.def.element, validator_groups);
            break;
        case "nullable":
        case "optional":
        case "default":
            //@ts-expect-error
            discover_loops(zod_definition._zod.def.innerType, validator_groups);
            break;
       case "record":
            parse_record(zod_definition._zod.def as z.core.$ZodRecordDef, validator_groups);
            break;
        case "union":
            parse_union(zod_definition._zod.def as z.core.$ZodUnionDef, validator_groups);
            break;
        default:
            break;
    }
    return validator_groups;
}

function parse_object(object_validator: z.ZodObject, validator_groups: Map<any, validator_group>) {
    let def = object_validator._zod.def;
    if(validator_groups.has(def)) {
        validator_groups.get(def).appearances++;
        return;
    }
    validator_groups.set(def, {
        appearances: 1,
        handle: ``,
        validator: object_validator,
        //@ts-ignore
        def: def,
        meta: {},
    })
    for(let [key, value] of Object.entries(def.shape)){
        //@ts-ignore
        discover_loops(value, validator_groups);
    }
}

function parse_record(def: z.core.$ZodRecordDef, validator_groups: Map<any, validator_group>): any {
    //@ts-ignore
    discover_loops(def.keyType, validator_groups);

    //@ts-ignore
    discover_loops(def.valueType, validator_groups);
}

function parse_union(def: z.core.$ZodUnionDef, validator_groups: Map<any, validator_group>): any {
    for(let option of def.options){
        //@ts-ignore
        discover_loops(option, validator_groups);
    }
}