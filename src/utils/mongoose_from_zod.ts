import { z } from "zod/v4"
import mongoose, { Schema } from "mongoose";

//export const z_mongodb_id = z.string().length(24).describe('F_Mongodb_ID');
//export const mongodb_id = () => z_mongodb_id;
const underlying_mongodb_id_validator = z.string().length(24);
const underlying_mongodb_id_validator_optional = underlying_mongodb_id_validator.optional();

export const z_mongodb_id = z.custom<string>((val) => {
    if(!val){ return false; }
    let parsed = underlying_mongodb_id_validator.safeParse(val);
    if (!parsed.success) {
        return false;
    } else {
        return true;
    }
}).meta({
    "type": "string",
    "format": "string",
}).meta({framework_override_type: 'mongodb_id'});

export const z_mongodb_id_optional = z.custom<string>((val) => {
    let parsed = underlying_mongodb_id_validator_optional.safeParse(val);
    if (!parsed.success) {
        return false;
    } else {
        return true;
    }
}).meta({
    "type": "string",
    "format": "string",
}).meta({framework_override_type: 'mongodb_id'});

export function mongoose_from_zod<T>(schema_name: string, zod_definition: z.core.$ZodType) {
    let mongoose_schema = schema_from_zod(zod_definition);
    return mongoose.model<T>(schema_name, mongoose_schema);
}

export function schema_from_zod(zod_definition: z.core.$ZodType): any {
    let mongoose_schema = schema_entry_from_zod(zod_definition as z.ZodType);
    delete mongoose_schema.type.required;
    delete mongoose_schema.type._id;
    return mongoose_schema.type;
}

export function schema_entry_from_zod(zod_definition: z.ZodType, loop_detector: Set<any> = new Set()): any {
    if(!zod_definition) {
        console.error('ISSUE');
        console.error(zod_definition);
    }

    let result;
    switch (zod_definition._zod.def.type) {
        case "string":
            result = parse_string(zod_definition._zod.def as z.core.$ZodStringDef);
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "number":
        case "int":
            result = parse_number(zod_definition._zod.def as z.core.$ZodNumberDef);
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "object":
            result = parse_object(zod_definition._zod.def as z.core.$ZodObjectDef, loop_detector);
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "boolean":
            result = parse_boolean(zod_definition._zod.def as z.core.$ZodBooleanDef);
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "date":
            result = parse_date(zod_definition._zod.def as z.core.$ZodDateDef);
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "undefined":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`)
        case "null":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`)
        case "array" :
            result = parse_array(zod_definition._zod.def as z.core.$ZodArrayDef, loop_detector);
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "nullable":
            // stuff is nullable in mongodb by default, so just return the ordinary results of the parse
            //@ts-expect-error
            return schema_entry_from_zod((zod_definition as z.core.$ZodNullable)._zod.def.innerType, loop_detector)
        case "optional":
            return parse_optional(zod_definition._zod.def as z.core.$ZodOptionalDef, loop_detector);
        case "record":
            result = parse_record(zod_definition._zod.def as z.core.$ZodRecordDef, loop_detector);
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "any" :
            result = { type: Schema.Types.Mixed };
        case "default":
            result = parse_default(zod_definition._zod.def as z.core.$ZodDefaultDef, loop_detector);
            result.required = true;
            return result;
        case "enum":
            result = parse_enum(zod_definition._zod.def as z.core.$ZodEnumDef)
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "union":
            result = parse_union(zod_definition._zod.def as z.core.$ZodUnionDef)
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "readonly":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`)
        case "custom":
            if(!zod_definition.meta()) {
                throw new Error(`could not find custom parser in the magic value dictionary`)
            }
            let { framework_override_type } = zod_definition.meta();

            if(framework_override_type === 'mongodb_id'){
                result = parse_mongodb_id(zod_definition._zod.def as z.core.$ZodCustomDef)
            } else {
                throw new Error(`could not find custom parser for ${framework_override_type} in the magic value dictionary`)
            }

            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        default:
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type);
    }
}

function parse_object(def: z.core.$ZodObjectDef, loop_detector: Set<any>): any {
    if(loop_detector.has(def)) {
        return {type: Schema.Types.Mixed, required: true}
    }
    loop_detector.add(def);

    let retval = {} as any;
    for(let [key, value] of Object.entries(def.shape)){
        //@ts-ignore
        retval[key] = schema_entry_from_zod(value, loop_detector);
    }
    return {type: retval, required: true};
}

function parse_array(def: z.core.$ZodArrayDef, loop_detector: Set<any>): any {
    //@ts-ignore
    let retval = { type: [schema_entry_from_zod(def.element, loop_detector)] } as any;
    retval.required = true;
    return retval;
}

function parse_enum(def: z.core.$ZodEnumDef): any {
    let retval = { type: String } as any;
    retval.required = true;
    return retval;
}

function parse_union(def: z.core.$ZodUnionDef): any {
    let retval = { type: Schema.Types.Mixed } as any;
    retval.required = true;
    return retval;
}

function parse_record(def: z.core.$ZodRecordDef, loop_detector: Set<any>): any {
    if(def.keyType._zod.def.type !== 'string') { throw new Error('mongoDB only supports maps where the key is a string.'); }
    //@ts-ignore
    let retval = { type: Schema.Types.Map, of: schema_entry_from_zod(def.valueType, loop_detector), required: true}
    retval.required = true;
    return retval;
}

function parse_string(def: z.core.$ZodStringDef): any {
    let retval = { type: String } as any;
    // for fixing the optional issue
    // https://github.com/colinhacks/zod/issues/4824
    return retval;
}

function parse_number(def: z.core.$ZodNumberDef): any {
    let retval = { type: Number } as any;
    return retval;
}

function parse_boolean(def: z.core.$ZodBooleanDef): any {
    let retval = { type: Boolean } as any;
    return retval;
}

function parse_date(def: z.core.$ZodDateDef): any {
    let retval = { type: Date } as any;
    return retval;
}

function parse_default(def: z.core.$ZodDefaultDef, loop_detector: Set<any>): any {
    //@ts-ignore
    let type_definition = schema_entry_from_zod(def.innerType, loop_detector);
    type_definition.default = def.defaultValue;
    return type_definition;
}

function parse_optional(def: z.core.$ZodOptionalDef, loop_detector: Set<any>): any {
    //@ts-ignore
    let type_definition = schema_entry_from_zod(def.innerType, loop_detector);
    type_definition.required = false;
    return type_definition;
}

function parse_mongodb_id(def: z.core.$ZodCustomDef): any {
    return { type: Schema.Types.ObjectId };
}