import { z } from "zod/v4";
import mongoose, { Schema } from "mongoose";
import { find_loops } from './zod_loop_seperator.js';
import { complex_query_map, query_meta_map } from "./query_object_to_mongodb_query.js";
const underlying_mongodb_id_validator = z.string().length(24);
const forbidden_prefixes = ['$'];
const forbidden_keys = [...Object.keys(query_meta_map)];
const forbidden_suffixes = [...Object.keys(complex_query_map)];
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
export function mongoose_schema_from_zod(schema_name, zod_definition, database = mongoose) {
    let mongoose_schema = schema_from_zod(zod_definition);
    return database.model(schema_name, new Schema(mongoose_schema, { typeKey: 'mongoose_type', minimize: false }));
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
            result = parse_union(zod_definition._zod.def, loop_detector);
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
            return result;
        default:
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type);
    }
}
function parse_object(def, loop_detector) {
    if (loop_detector.has(def)) {
        return { mongoose_type: Schema.Types.Mixed, required: true };
    }
    let retval = build_object_fields(def, loop_detector);
    apply_auto_id_handling(retval);
    return { mongoose_type: retval, required: true };
}
function build_object_fields(def, loop_detector) {
    let retval = {};
    for (let [key, value] of Object.entries(def.shape)) {
        for (let forbidden_key of forbidden_keys) {
            if (key.toLowerCase() === forbidden_key) {
                throw new Error(`"${forbidden_key}" is a forbidden field name because it's used in query parameters. Please check your validators and replace this key with something else.`);
            }
        }
        for (let forbidden_prefix of forbidden_prefixes) {
            if (key.toLowerCase().startsWith(forbidden_prefix)) {
                throw new Error(`"${key}" is not a valid field name because it begins with "${forbidden_prefix}". Please check your validators and replace this key with something else.`);
            }
        }
        for (let forbidden_suffix of forbidden_suffixes) {
            if (key.toLowerCase().endsWith(forbidden_suffix)) {
                throw new Error(`"${key}" is not a valid field name because it ends with "${forbidden_suffix}". Please check your validators and replace this key with something else.`);
            }
        }
        retval[key] = schema_entry_from_zod(value, loop_detector);
    }
    return retval;
}
function apply_auto_id_handling(retval) {
    if (!retval._id) {
        retval._id = false;
    }
    else {
        delete retval._id;
    }
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
function flatten_union_options(options) {
    return options.flatMap(option => option._zod.def.type === 'union' ? flatten_union_options(option._zod.def.options) : [option]);
}
function parse_union(def, loop_detector) {
    let options = flatten_union_options(def.options);
    let object_options = options.filter(option => option._zod.def.type === 'object');
    if (options.length === 0) {
        throw new Error('Union type contained no options');
    }
    if (object_options.length === options.length) {
        let options_as_mongodb_schemas = options.map(option => build_object_fields(option._zod.def, loop_detector));
        let all_keys = new Set(options_as_mongodb_schemas.flatMap(ele => Object.keys(ele)));
        let merged = {};
        for (let key of all_keys) {
            let variants = options_as_mongodb_schemas.map(option => option[key]).filter(entry => entry !== undefined);
            let [first, ...rest] = variants;
            let are_all_variants_same_type = rest.every(entry => {
                return values_deep_equal(first.mongoose_type, entry.mongoose_type) && values_deep_equal(first.of, entry.of);
            });
            let are_variants_present_in_every_branch = variants.length === options_as_mongodb_schemas.length;
            if (are_all_variants_same_type) {
                merged[key] = {
                    ...first,
                    required: are_variants_present_in_every_branch && variants.every(entry => entry.required)
                };
            }
            else {
                merged[key] = { mongoose_type: Schema.Types.Mixed, required: false };
            }
        }
        apply_auto_id_handling(merged);
        return { mongoose_type: merged, required: true };
    }
    else if (object_options.length > 0) {
        console.warn(`Mixing objects and primitives in a z.or() is not well-supported. At minimum, you'll need to perform any ObjectID casting yourself.`);
        return {
            mongoose_type: Schema.Types.Mixed,
            required: true,
        };
    }
    return { mongoose_type: Schema.Types.Mixed, required: true };
}
function parse_record(def, loop_detector) {
    if (!['string', 'enum'].includes(def.keyType._zod.def.type)) {
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
    return { mongoose_type: Schema.Types.ObjectId, required: !(meta.optional || meta.nullable) };
}
function values_deep_equal(a, b) {
    if (a === b) {
        return true;
    }
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
        return false;
    }
    if (Array.isArray(a) !== Array.isArray(b)) {
        return false;
    }
    if (Array.isArray(a)) {
        return a.length === b.length && a.every((entry, index) => values_deep_equal(entry, b[index]));
    }
    let a_keys = Object.keys(a);
    let b_keys = Object.keys(b);
    return a_keys.length === b_keys.length && a_keys.every(key => values_deep_equal(a[key], b[key]));
}
//# sourceMappingURL=mongoose_schema_from_zod.js.map