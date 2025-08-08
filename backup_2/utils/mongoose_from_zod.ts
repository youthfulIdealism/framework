import { z } from "zod/v4"
import mongoose, { Schema } from "mongoose";


//export const z_mongodb_id = z.string().length(24).describe('F_Mongodb_ID');
//export const mongodb_id = () => z_mongodb_id;
const underlying_mongodb_id_validator = z.string().length(24);
export const z_mongodb_id = z.custom<string>((val) => {
    return underlying_mongodb_id_validator.parse(val) === val;
});

export function mongoose_from_zod<T>(schema_name: string, zod_definition: z.ZodTypeAny) {
    let mongoose_schema = schema_from_zod(zod_definition);
    return mongoose.model<T>(schema_name, mongoose_schema);
}

export function schema_from_zod(zod_definition: z.ZodTypeAny): any {
    let mongoose_schema = schema_entry_from_zod(zod_definition as z.ZodTypeAny);
    delete mongoose_schema.type.required;
    delete mongoose_schema.type._id;
    return mongoose_schema.type;
}

    //type:"int" |  | "bigint" | "symbol" | | | "void" | "never" || "unknown" | |  | "record" | "file" || "tuple" | "union" | "intersection" | | "set" | | "literal" | | | "nonoptional" | "success" | "transform" | | "prefault" | "catch" | "nan" | "pipe" | | "template_literal" | "promise" | "lazy" | "custom";

export function schema_entry_from_zod(zod_definition: z.ZodTypeAny): any {
    let result;
    switch (zod_definition._zod.def.type) {
        case "string":
            result = parse_string(zod_definition._zod.def as z.core.$ZodStringDef);
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "number":
            result = parse_number(zod_definition._zod.def as z.core.$ZodNumberDef);
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "object":
            result = parse_object(zod_definition._zod.def as z.core.$ZodObjectDef);
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
            result = parse_array(zod_definition._zod.def as z.core.$ZodArrayDef);
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "nullable":
            // stuff is nullable in mongodb by default, so just return the ordinary results of the parse
            //@ts-expect-error
            return schema_entry_from_zod((zod_definition as z.core.$ZodNullable)._zod.def.innerType)
        case "optional":
            return parse_optional(zod_definition._zod.def as z.core.$ZodOptionalDef);
        case "map":
            result = parse_map(zod_definition._zod.def as z.core.$ZodMapDef);
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "any" :
            result = { type: Schema.Types.Mixed/*, required: !zod_definition._zod.def.optional*/ };
        case "default":
            result = parse_default(zod_definition._zod.def as z.core.$ZodDefaultDef);
            //result.required = !zod_definition.safeParse(undefined).success;
            result.required = true;
            return result;
        //case ZodFirstPartyTypeKind.ZodBranded:
        //    return parse_branded(zod_definition._zod.def)
        case "enum":
            result = parse_enum(zod_definition._zod.def as z.core.$ZodEnumDef)
            result.required = !zod_definition.safeParse(undefined).success
            return result;
        case "readonly":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`)
        //case ZodFirstPartyTypeKind.ZodBigInt:
        //case ZodFirstPartyTypeKind.ZodUnion:
        //case ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
        //case ZodFirstPartyTypeKind.ZodIntersection:
        //case ZodFirstPartyTypeKind.ZodTuple:
        //case ZodFirstPartyTypeKind.ZodRecord:
        //case ZodFirstPartyTypeKind.ZodLiteral:
        //case ZodFirstPartyTypeKind.ZodNativeEnum:
        //case ZodFirstPartyTypeKind.ZodSet:
        //case ZodFirstPartyTypeKind.ZodLazy:
        //case ZodFirstPartyTypeKind.ZodPromise:
        //case ZodFirstPartyTypeKind.ZodNaN:
        //case ZodFirstPartyTypeKind.ZodNever:
        //case ZodFirstPartyTypeKind.ZodEffects:
        //case ZodFirstPartyTypeKind.ZodUnknown:
        //case ZodFirstPartyTypeKind.ZodCatch:
        //case ZodFirstPartyTypeKind.ZodPipeline:
        //case ZodFirstPartyTypeKind.ZodFunction:
        //case ZodFirstPartyTypeKind.ZodVoid:
        //case ZodFirstPartyTypeKind.ZodSymbol:
        default:
          throw new Error("Cannot process zod type: " + zod_definition._zod.def.type);
      }
}

function parse_object(def: z.core.$ZodObjectDef): any {
    let retval = {} as any;
    for(let [key, value] of Object.entries(def.shape)){
        //@ts-ignore
        retval[key] = schema_entry_from_zod(value);
    }
    return {type: retval, required: true};
}

function parse_array(def: z.core.$ZodArrayDef): any {
    //@ts-ignore
    let retval = { type: [schema_entry_from_zod(def.element)] } as any;
    retval.required = true;
    return retval;
}

function parse_enum(def: z.core.$ZodEnumDef): any {
    let retval = { type: String } as any;
    retval.required = true;
    return retval;
}

function parse_map(def: z.core.$ZodMapDef): any {
    if(def.keyType._zod.def.type !== 'string') { throw new Error('mongoDB only supports maps where the key is a string.'); }
    //@ts-ignore
    let retval = { type: Schema.Types.Map, of: schema_entry_from_zod(def.valueType), required: true}
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

function parse_default(def: z.core.$ZodDefaultDef): any {
    //@ts-ignore
    let type_definition = schema_entry_from_zod(def.innerType);
    type_definition.default = def.defaultValue;
    return type_definition;
}

function parse_optional(def: z.core.$ZodOptionalDef): any {
    //@ts-ignore
    let type_definition = schema_entry_from_zod(def.innerType);
    type_definition.required = false;
    return type_definition;
}

/*function parse_branded(def: ZodBrandedDef<ZodTypeAny>): any {
    switch(def.description){
        case 'F_Mongodb_ID':
            let retval = { type: Schema.Types.ObjectId, required: false } as any;
            retval.required = true;
            return retval;
        default:
            return schema_entry_from_zod(def.type);
    }
}*/