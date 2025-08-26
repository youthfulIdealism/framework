import { z } from "zod/v4";
import mongoose, { Schema } from "mongoose";
export const magic_values = z.registry();
const underlying_mongodb_id_validator = z.string().length(24);
export const z_mongodb_id = z.custom((val) => {
    if (!val) {
        return false;
    }
    return underlying_mongodb_id_validator.parse(val) === val;
}).meta({
    "type": "string",
    "format": "string",
}).register(magic_values, { override_type: 'mongodb_id' });
export function mongoose_from_zod(schema_name, zod_definition) {
    let mongoose_schema = schema_from_zod(zod_definition);
    return mongoose.model(schema_name, mongoose_schema);
}
export function schema_from_zod(zod_definition) {
    let mongoose_schema = schema_entry_from_zod(zod_definition);
    delete mongoose_schema.type.required;
    delete mongoose_schema.type._id;
    return mongoose_schema.type;
}
export function schema_entry_from_zod(zod_definition) {
    if (!zod_definition) {
        console.log('ISSUE');
        console.log(zod_definition);
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
            result = parse_object(zod_definition._zod.def);
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
            result = parse_array(zod_definition._zod.def);
            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        case "nullable":
            return schema_entry_from_zod(zod_definition._zod.def.innerType);
        case "optional":
            return parse_optional(zod_definition._zod.def);
        case "map":
            result = parse_map(zod_definition._zod.def);
            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        case "any":
            result = { type: Schema.Types.Mixed };
        case "default":
            result = parse_default(zod_definition._zod.def);
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
            if (!magic_values.has(zod_definition)) {
                throw new Error(`could not find custom parser in the magic value dictionary`);
            }
            let { override_type } = magic_values.get(zod_definition);
            if (override_type === 'mongodb_id') {
                result = parse_mongodb_id(zod_definition._zod.def);
            }
            else {
                throw new Error(`could not find custom parser for ${override_type} in the magic value dictionary`);
            }
            result.required = !zod_definition.safeParse(undefined).success;
            return result;
        default:
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type);
    }
}
function parse_object(def) {
    let retval = {};
    for (let [key, value] of Object.entries(def.shape)) {
        retval[key] = schema_entry_from_zod(value);
    }
    return { type: retval, required: true };
}
function parse_array(def) {
    let retval = { type: [schema_entry_from_zod(def.element)] };
    retval.required = true;
    return retval;
}
function parse_enum(def) {
    let retval = { type: String };
    retval.required = true;
    return retval;
}
function parse_union(def) {
    let retval = { type: Schema.Types.Mixed };
    retval.required = true;
    return retval;
}
function parse_map(def) {
    if (def.keyType._zod.def.type !== 'string') {
        throw new Error('mongoDB only supports maps where the key is a string.');
    }
    let retval = { type: Schema.Types.Map, of: schema_entry_from_zod(def.valueType), required: true };
    retval.required = true;
    return retval;
}
function parse_string(def) {
    let retval = { type: String };
    return retval;
}
function parse_number(def) {
    let retval = { type: Number };
    return retval;
}
function parse_boolean(def) {
    let retval = { type: Boolean };
    return retval;
}
function parse_date(def) {
    let retval = { type: Date };
    return retval;
}
function parse_default(def) {
    let type_definition = schema_entry_from_zod(def.innerType);
    type_definition.default = def.defaultValue;
    return type_definition;
}
function parse_optional(def) {
    let type_definition = schema_entry_from_zod(def.innerType);
    type_definition.required = false;
    return type_definition;
}
function parse_mongodb_id(def) {
    return { type: Schema.Types.ObjectId };
}
//# sourceMappingURL=mongoose_from_zod.js.map