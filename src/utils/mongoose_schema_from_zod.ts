import { z } from "zod/v4"
import mongoose, { Schema } from "mongoose";

import { find_loops, validator_group } from './zod_loop_seperator.js'
import { complex_query_map, query_meta_map } from "./query_object_to_mongodb_query.js";

const underlying_mongodb_id_validator = z.string().length(24);

const forbidden_prefixes = ['$'];
const forbidden_keys = [...Object.keys(query_meta_map)]
const forbidden_suffixes = [...Object.keys(complex_query_map)]

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

export function mongoose_schema_from_zod<T>(schema_name: string, zod_definition: z.core.$ZodType, database: typeof mongoose = mongoose) {
    let mongoose_schema = schema_from_zod(zod_definition);
    return database.model<T>(schema_name, new Schema(mongoose_schema, {typeKey: 'mongoose_type', minimize: false}));
}

export function schema_from_zod(zod_definition: z.core.$ZodType): any {
    let loops = find_loops(zod_definition as z.ZodType);
    let mongoose_schema = schema_entry_from_zod(zod_definition as z.ZodType, loops);
    delete mongoose_schema.mongoose_type.required;
    delete mongoose_schema.mongoose_type._id;
    return mongoose_schema.mongoose_type;
}

export function schema_entry_from_zod(zod_definition: z.ZodType, loop_detector: Map<any, validator_group>): any {
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
        case "optional":
            // stuff is nullable in mongodb by default, so just return the ordinary results of the parse
            ////@ts-expect-error
            //return schema_entry_from_zod((zod_definition as z.core.$ZodNullable)._zod.def.innerType, loop_detector)
            return parse_optional(zod_definition._zod.def as z.core.$ZodOptionalDef, loop_detector);
        case "record":
            result = parse_record(zod_definition._zod.def as z.core.$ZodRecordDef, loop_detector);
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "any" :
            result = { mongoose_type: Schema.Types.Mixed, required: false };
            return result;
        case "default":
            result = parse_default(zod_definition._zod.def as z.core.$ZodDefaultDef, loop_detector);
            result.required = true;
            return result;
        case "enum":
            result = parse_enum(zod_definition._zod.def as z.core.$ZodEnumDef)
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "union":
            result = parse_union(zod_definition._zod.def as z.core.$ZodUnionDef, loop_detector)
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
                result = parse_mongodb_id(zod_definition._zod.def as z.core.$ZodCustomDef, zod_definition.meta() as {framework_override_type: 'mongodb_id'})
            } else {
                throw new Error(`could not find custom parser for ${framework_override_type} in the magic value dictionary`)
            }

            return result;
        default:
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type);
    }
}

function parse_object(def: z.core.$ZodObjectDef, loop_detector: Map<any, validator_group> ): any {
    if(loop_detector.has(def)) {
        return { mongoose_type: Schema.Types.Mixed, required: true }
    }

    let retval = build_object_fields(def, loop_detector);
    apply_auto_id_handling(retval);
    return {mongoose_type: retval, required: true};
}

function build_object_fields(def: z.core.$ZodObjectDef, loop_detector: Map<any, validator_group> ): any {
    let retval = {} as any;
    for(let [key, value] of Object.entries(def.shape)){
        for(let forbidden_key of forbidden_keys){
            if(key.toLowerCase() === forbidden_key){
                throw new Error(`"${forbidden_key}" is a forbidden field name because it's used in query parameters. Please check your validators and replace this key with something else.`)
            }
        }

        for(let forbidden_prefix of forbidden_prefixes){
            if(key.toLowerCase().startsWith(forbidden_prefix)){
                throw new Error(`"${key}" is not a valid field name because it begins with "${forbidden_prefix}". Please check your validators and replace this key with something else.`)
            }
        }

        for(let forbidden_suffix of forbidden_suffixes){
            if(key.toLowerCase().endsWith(forbidden_suffix)){
                throw new Error(`"${key}" is not a valid field name because it ends with "${forbidden_suffix}". Please check your validators and replace this key with something else.`)
            }
        }
        //@ts-ignore
        retval[key] = schema_entry_from_zod(value, loop_detector);
    }
    return retval;
}

// handle the edge cases around mongoose's auto-IDs
function apply_auto_id_handling(retval: any): void {
    if(!retval._id){ retval._id = false; }
    else { delete retval._id; }
}

function parse_array(def: z.core.$ZodArrayDef, loop_detector: Map<any, validator_group> ): any {
    //@ts-ignore
    let retval = { mongoose_type: [schema_entry_from_zod(def.element, loop_detector)] } as any;
    retval.required = true;
    return retval;
}

function parse_enum(def: z.core.$ZodEnumDef): any {
    let retval = { mongoose_type: String } as any;
    retval.required = true;
    return retval;
}

// `.or()` builds nested unions (`a.or(b).or(c)` === `union([union([a, b]), c])`)
// so a chain of 3+ options hides everything but the outermost couple of
// branches unless we recursively unwrap nested union options first.
function flatten_union_options(options: readonly z.core.$ZodType[]): z.core.$ZodType[] {
    return options.flatMap(option => option._zod.def.type === 'union' ? flatten_union_options((option._zod.def as z.core.$ZodUnionDef).options) : [option]);
}

function parse_union(def: z.core.$ZodUnionDef, loop_detector: Map<any, validator_group>): any {
    let options = flatten_union_options(def.options);
    let object_options = options.filter(option => option._zod.def.type === 'object');

    if(options.length === 0) {
        throw new Error('Union type contained no options')
    }

    // when every branch of the union is an object (e.g. z.object({...}).or(z.object({...}))),
    // merge their fields into a single subdocument schema instead of collapsing to Mixed. Mongoose
    // has no concept of "either of these object shapes," but by merging we make sure fields like
    // mongoDB IDs still get cast correctly no matter which branch a given document matches, since
    // Mixed fields are stored as-is with no casting at all.
    if(object_options.length === options.length){
        // when every .or() is an object
        // (for example:
        //   z.object({
        //       decor_type: z.enum(['sprinkle'])
        //       sprinkle_field: z_mongodb_id,
        //   }).or(z.object({
        //       decor_type: z.enum(['frosting'])
        //       frosting_field: z.string()
        //   }))
        // ), flatten the resulting mongoose schema
        // into one shape so that mongoDB IDs still
        // get cast correctly, for example:
        // {
        //      mongoose_type: {
        //          decor_type: { type: string },
        //          sprinkle_field: { type: Schema.Types.ObjectI d},
        //          frosting_field: { type: string }
        //      }
        // }

        let options_as_mongodb_schemas = options.map(option => build_object_fields(option._zod.def as z.core.$ZodObjectDef, loop_detector));
        let all_keys = new Set<string>(options_as_mongodb_schemas.flatMap(ele => Object.keys(ele)));

        let merged = {} as any;
        for(let key of all_keys){
            let variants = options_as_mongodb_schemas.map(option => option[key]).filter(entry => entry !== undefined);

            let [first, ...rest] = variants;
            let are_all_variants_same_type = rest.every(entry => {
                // .of is used for the record type in parse_record
                return values_deep_equal(first.mongoose_type, entry.mongoose_type) && values_deep_equal(first.of, entry.of);
            });
            let are_variants_present_in_every_branch = variants.length === options_as_mongodb_schemas.length;

            if(are_all_variants_same_type){
                merged[key] = {
                    ...first,
                    required: are_variants_present_in_every_branch && variants.every(entry => entry.required)
                }
            } else {
                merged[key] = { mongoose_type: Schema.Types.Mixed, required: false };
            }
        }

        apply_auto_id_handling(merged);
        return { mongoose_type: merged, required: true };
    } else if(object_options.length > 0) {
        console.warn(`Mixing objects and primitives in a z.or() is not well-supported. At minimum, you'll need to perform any ObjectID casting yourself.`)
        return {
            mongoose_type: Schema.Types.Mixed,
            required: true,
        };
    }

    return { mongoose_type: Schema.Types.Mixed, required: true };
}

function parse_record(def: z.core.$ZodRecordDef, loop_detector: Map<any, validator_group> ): any {
    if(!['string', 'enum'].includes(def.keyType._zod.def.type)) {
        throw new Error('mongoDB only supports maps where the key is a string.');
    }
    //@ts-ignore
    let retval = { mongoose_type: Schema.Types.Map, of: schema_entry_from_zod(def.valueType, loop_detector), required: true}
    retval.required = true;
    return retval;
}

function parse_string(def: z.core.$ZodStringDef): any {
    let retval = { mongoose_type: String } as any;
    // for fixing the optional issue
    // https://github.com/colinhacks/zod/issues/4824
    return retval;
}

function parse_number(def: z.core.$ZodNumberDef): any {
    let retval = { mongoose_type: Number } as any;
    return retval;
}

function parse_boolean(def: z.core.$ZodBooleanDef): any {
    let retval = { mongoose_type: Boolean } as any;
    return retval;
}

function parse_date(def: z.core.$ZodDateDef): any {
    let retval = { mongoose_type: Date } as any;
    return retval;
}

function parse_default(def: z.core.$ZodDefaultDef, loop_detector: Map<any, validator_group> ): any {
    //@ts-ignore
    let type_definition = schema_entry_from_zod(def.innerType, loop_detector);
    type_definition.default = def.defaultValue;
    return type_definition;
}

function parse_optional(def: z.core.$ZodOptionalDef, loop_detector: Map<any, validator_group> ): any {
    //@ts-ignore
    let type_definition = schema_entry_from_zod(def.innerType, loop_detector);
    type_definition.required = false;
    return type_definition;
}

function parse_mongodb_id(def: z.core.$ZodCustomDef, meta: { framework_override_type: 'mongodb_id', optional?: boolean, nullable?: boolean}): any {
    return { mongoose_type: Schema.Types.ObjectId, required: !(meta.optional || meta.nullable) };
}

function values_deep_equal(a: any, b: any): boolean {
    if(a === b){ return true; }
    if(typeof a !== 'object' || typeof b !== 'object' || a === null || b === null){ return false; }
    if(Array.isArray(a) !== Array.isArray(b)){ return false; }
    if(Array.isArray(a)){
        return a.length === b.length && a.every((entry, index) => values_deep_equal(entry, b[index]));
    }

    let a_keys = Object.keys(a);
    let b_keys = Object.keys(b);
    return a_keys.length === b_keys.length && a_keys.every(key => values_deep_equal(a[key], b[key]));
}