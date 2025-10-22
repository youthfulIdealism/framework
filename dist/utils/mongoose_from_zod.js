import { z } from "zod/v4";
import mongoose, { Schema } from "mongoose";
import { find_loops } from './zod_loop_seperator.js';
const underlying_mongodb_id_validator = z.string().length(24);
const underlying_mongodb_id_validator_optional = underlying_mongodb_id_validator.optional();
const underlying_mongodb_id_validator_nullable = underlying_mongodb_id_validator.nullable();
export const z_mongodb_id = z.custom((val) => {
    if (!val) {
        return false;
    }
    let parsed = underlying_mongodb_id_validator.safeParse(val);
    if (!parsed.success) {
        return false;
    }
    else {
        return true;
    }
}).meta({
    "type": "string",
    "format": "string",
}).meta({ framework_override_type: 'mongodb_id' });
export const z_mongodb_id_optional = z.custom((val) => {
    let parsed = underlying_mongodb_id_validator_optional.safeParse(val);
    if (!parsed.success) {
        return false;
    }
    else {
        return true;
    }
}).meta({
    "type": "string",
    "format": "string",
}).meta({ framework_override_type: 'mongodb_id', optional: true });
export const z_mongodb_id_nullable = z.custom((val) => {
    let parsed = underlying_mongodb_id_validator_nullable.safeParse(val);
    if (!parsed.success) {
        return false;
    }
    else {
        return true;
    }
}).meta({
    "type": "string",
    "format": "string",
}).meta({ framework_override_type: 'mongodb_id', nullable: true });
export function mongoose_from_zod(schema_name, zod_definition) {
    let mongoose_schema = schema_from_zod(zod_definition);
    return mongoose.model(schema_name, new Schema(mongoose_schema, { typeKey: 'mongoose_type' }));
}
export function schema_from_zod(zod_definition) {
    let loops = find_loops(zod_definition);
    let mongoose_schema = schema_entry_from_zod(zod_definition, loops);
    delete mongoose_schema.mongoose_type.required;
    delete mongoose_schema.mongoose_type._id;
    return mongoose_schema.mongoose_type;
}
export function schema_entry_from_zod(zod_definition, loop_detector) {
    if (!zod_definition) {
        console.error('ISSUE');
        console.error(zod_definition);
    }
    let result;
    switch (zod_definition._zod.def.type) {
        case "string":
            result = parse_string(zod_definition._zod.def);
            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        case "number":
        case "int":
            result = parse_number(zod_definition._zod.def);
            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        case "object":
            result = parse_object(zod_definition._zod.def, loop_detector);
            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        case "boolean":
            result = parse_boolean(zod_definition._zod.def);
            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        case "date":
            result = parse_date(zod_definition._zod.def);
            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        case "undefined":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`);
        case "null":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`);
        case "array":
            result = parse_array(zod_definition._zod.def, loop_detector);
            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        case "nullable":
            return schema_entry_from_zod(zod_definition._zod.def.innerType, loop_detector);
        case "optional":
            return parse_optional(zod_definition._zod.def, loop_detector);
        case "record":
            result = parse_record(zod_definition._zod.def, loop_detector);
            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        case "any":
            result = { mongoose_type: Schema.Types.Mixed, required: false };
            return result;
        case "default":
            result = parse_default(zod_definition._zod.def, loop_detector);
            result.required = true;
            return result;
        case "enum":
            result = parse_enum(zod_definition._zod.def);
            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        case "union":
            result = parse_union(zod_definition._zod.def);
            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        case "readonly":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`);
        case "custom":
            if (!zod_definition.meta()) {
                throw new Error(`could not find custom parser in the magic value dictionary`);
            }
            let { framework_override_type } = zod_definition.meta();
            if (framework_override_type === 'mongodb_id') {
                result = parse_mongodb_id(zod_definition._zod.def, zod_definition.meta());
            }
            else {
                throw new Error(`could not find custom parser for ${framework_override_type} in the magic value dictionary`);
            }
            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        default:
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type);
    }
}
function parse_object(def, loop_detector) {
    if (loop_detector.has(def)) {
        return { mongoose_type: Schema.Types.Mixed, required: true };
    }
    let retval = {};
    for (let [key, value] of Object.entries(def.shape)) {
        retval[key] = schema_entry_from_zod(value, loop_detector);
    }
    return { mongoose_type: retval, required: true };
}
function parse_array(def, loop_detector) {
    let retval = { mongoose_type: [schema_entry_from_zod(def.element, loop_detector)] };
    retval.required = true;
    return retval;
}
function parse_enum(def) {
    let retval = { mongoose_type: String };
    retval.required = true;
    return retval;
}
function parse_union(def) {
    let retval = { mongoose_type: Schema.Types.Mixed };
    retval.required = true;
    return retval;
}
function parse_record(def, loop_detector) {
    if (def.keyType._zod.def.type !== 'string') {
        throw new Error('mongoDB only supports maps where the key is a string.');
    }
    let retval = { mongoose_type: Schema.Types.Map, of: schema_entry_from_zod(def.valueType, loop_detector), required: true };
    retval.required = true;
    return retval;
}
function parse_string(def) {
    let retval = { mongoose_type: String };
    return retval;
}
function parse_number(def) {
    let retval = { mongoose_type: Number };
    return retval;
}
function parse_boolean(def) {
    let retval = { mongoose_type: Boolean };
    return retval;
}
function parse_date(def) {
    let retval = { mongoose_type: Date };
    return retval;
}
function parse_default(def, loop_detector) {
    let type_definition = schema_entry_from_zod(def.innerType, loop_detector);
    type_definition.default = def.defaultValue;
    return type_definition;
}
function parse_optional(def, loop_detector) {
    let type_definition = schema_entry_from_zod(def.innerType, loop_detector);
    type_definition.required = false;
    return type_definition;
}
function parse_mongodb_id(def, meta) {
    return { mongoose_type: Schema.Types.ObjectId, required: meta.optional || meta.nullable };
}
//# sourceMappingURL=mongoose_from_zod.js.map