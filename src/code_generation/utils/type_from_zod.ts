import { z, ZodType } from "zod/v4"
import mongoose, { Schema } from "mongoose";
import { magic_values } from "../../utils/mongoose_from_zod.js"
import { indent } from "./tab_indent.js"

/*export function mongoose_from_zod<T>(schema_name: string, zod_definition: z.core.$ZodType) {
    let mongoose_schema = schema_from_zod(zod_definition);
    return mongoose.model<T>(schema_name, mongoose_schema);
}*/

/*export function schema_from_zod(zod_definition: z.core.$ZodType): any {
    let mongoose_schema = schema_entry_from_zod(zod_definition as z.ZodType);
    delete mongoose_schema.type.required;
    delete mongoose_schema.type._id;
    return mongoose_schema.type;
}*/

export function type_from_zod(zod_definition: z.ZodType, indent_level: number): string[] {
    if(!zod_definition._zod) {
        console.log('ISSUE');
        console.log(zod_definition);
    }
    
    switch (zod_definition._zod.def.type) {
        case "string":
            return ['string'];
        case "number":
        case "int":
            return ['number'];
        case "object":
            return parse_object(zod_definition._zod.def as z.core.$ZodObjectDef, indent_level);
        case "boolean":
            return ['boolean'];
        case "date":
            return ['Date'];
        case "undefined":
            return ['undefined']
        case "null":
            return ['null']
        case "array":
            return parse_array(zod_definition._zod.def as z.core.$ZodArrayDef, indent_level)
        /*
        case "any":
            return ["any"]
        case "nullable":
            //stuff is nullable in mongodb by default, so just return the ordinary results of the parse
            //@ts-expect-error
            return type_from_zod((zod_definition as z.core.$ZodNullable)._zod.def.innerType)*/
        case "map":
            return  parse_map(zod_definition._zod.def as z.core.$ZodMapDef, indent_level);
        case "enum":
            return parse_enum(zod_definition._zod.def as z.core.$ZodEnumDef)
        case "readonly":
            throw new Error(`Zod type not yet supported by type_from_zod: ${zod_definition._zod.def.type});`)
        case "default":
            return type_from_zod((zod_definition._zod.def as z.core.$ZodDefaultDef).innerType as ZodType, indent_level);
        case "custom":
            let result = [];
            if(!magic_values.has(zod_definition)) {
                throw new Error(`could not find custom parser in the magic value dictionary for type_from_zod`)
            }
            let { override_type } = magic_values.get(zod_definition);

            if(override_type === 'mongodb_id'){
                result = ['string'];
            } else {
                throw new Error(`could not find custom parser for ${override_type} in the magic value dictionary`)
            }

            return result;
        default:
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type);
    }
}

function parse_object(def: z.core.$ZodObjectDef, indent_level: number): string[] {
    let retval = ['{']
    for(let [key, value] of Object.entries(def.shape)){
        //@ts-ignore
        let key_phrase = (value.safeParse(undefined).success || value._zod.def.type === 'optional') ? `"${key}"?:` : `"${key}":`;

        let non_optional_type = value;
        
        //@ts-ignore
        while(non_optional_type._zod.def.type === 'optional'){ non_optional_type = non_optional_type._zod.def.innerType;}
        let type_value = type_from_zod(non_optional_type as ZodType, indent_level + 1)
        
        if(type_value.length > 1 ){
            retval.push(indent(indent_level + 1, `${key_phrase} ${type_value[0]}`))
            retval.push(...type_value.slice(1))
        } else {
            retval.push(indent(indent_level + 1, `${key_phrase} ${type_value[0]}`))
        }
    }

    retval.push(indent(indent_level, '}'));
    return retval;
}

function parse_array(def: z.core.$ZodArrayDef, indent_level: number): any {
    //@ts-ignore
    let retval = type_from_zod(def.element as z.ZodType, indent_level + 1)
    retval[retval.length - 1] = `${retval[retval.length - 1]}[]`
    return retval;
}

function parse_enum(def: z.core.$ZodEnumDef): any {
    return [ `("${Object.values(def.entries).join('" | "')}")`];
}

function parse_map(def: z.core.$ZodMapDef, indent_level: number): any {
    let retval = ['{']
    //@ts-ignore
    let key_phrase = `[key: ${type_from_zod(def.keyType, indent_level + 1)}]:`;

    //@ts-ignore
    let type_value = type_from_zod(def.valueType, indent_level + 1)
    
    if(type_value.length > 1 ){
        retval.push(indent(indent_level + 1, `${key_phrase} ${type_value[0]}`))
        retval.push(...type_value.slice(1))
    } else {
        retval.push(indent(indent_level + 1, `${key_phrase} ${type_value[0]}`))
    }

    retval.push(indent(indent_level, '}'));
    return retval;
}

function parse_optional(def: z.core.$ZodOptionalDef): any {
    //@ts-ignore
    let type_definition = schema_entry_from_zod(def.innerType);
    type_definition.required = false;
    return type_definition;
}

function parse_mongodb_id(def: z.core.$ZodCustomDef): any {
    return { type: Schema.Types.ObjectId };
}