import { z } from "zod/v4"

export function pretty_print(zod_definition: z.ZodObject){
    console.log(parse_object(zod_definition._zod.def, new Set())); 
}

function parse_any(zod_definition: z.ZodType, loop_detector: Set<any> = new Set()): any {
    switch (zod_definition._zod.def.type) {
        case "enum":
            return parse_enum(zod_definition._zod.def as z.core.$ZodEnumDef);
        case "string":
            return 'string';
        case "number":
        case "int":
            return 'number';
        case "object":
            return parse_object(zod_definition._zod.def as z.core.$ZodObjectDef, loop_detector);
        case "boolean":
            return 'boolean';
        case "date":
            return 'date';
        case "array":
            return parse_array(zod_definition._zod.def as z.core.$ZodArrayDef, loop_detector)
        case "union":
            return parse_union(zod_definition._zod.def as z.core.$ZodUnionDef,)
        case "custom":
            if(!zod_definition.meta()) {
                throw new Error(`could not find custom parser in the magic value dictionary`)
            }
            let { framework_override_type } = zod_definition.meta();

            if(framework_override_type === 'mongodb_id'){
                return 'mongodb_id';
            } else {
                throw new Error(`could not find custom parser for ${framework_override_type} in the magic value dictionary`)
            }
        case "default":
            //@ts-ignore
            return parse_any((zod_definition._zod.def as z.core.$ZodDefaultDef).innerType, loop_detector)
        case "optional":
            //@ts-ignore
            return parse_any((zod_definition._zod.def as z.core.$ZodOptionalDef).innerType, loop_detector)
        default:
            return `unknown type ${zod_definition._zod.def.type}`
    }
}

function parse_array(def: z.core.$ZodArrayDef, loop_detector: Set<any>) {
    //@ts-ignore
    return [parse_any(def.element, loop_detector)];
}

function parse_object(def: z.core.$ZodObjectDef, loop_detector: Set<any>) {
    if(loop_detector.has(def)) {
        return 'RECURSION';
    }
    loop_detector.add(def);

    let retval = {} as any;
    for(let [key, value] of Object.entries(def.shape)){
        //@ts-expect-error
        retval[key] = parse_any(value, loop_detector);
    }
    return retval;
}

function parse_union(def: z.core.$ZodUnionDef) {
    //@ts-expect-error
    return { or: def.options.map(ele => parse_any(ele)) }
}

function parse_enum(definition: z.core.$ZodEnumDef) {
    return { enum: definition.entries}
}