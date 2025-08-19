import { OpenApiBuilder, ParameterObject, ReferenceObject, ResponseObject, SchemaObject } from 'openapi3-ts/oas31';
import { F_Collection } from '../F_Collection.js';
import z, { ZodPipe } from 'zod/v4';
import { magic_values } from './mongoose_from_zod.js';
import { simple_type, simple_type_with_format, query_array, success, error, path_parameter } from './openapi_builder_utils.js';

export function zod_to_openapi_schema(zod_definition: z.ZodTypeAny): SchemaObject {
    let result;
    switch (zod_definition._zod.def.type) {
        case "string":
            return simple_type('string');
        case "number":
        case "int":
            return simple_type('number');
        case "object":
            return parse_object(zod_definition._zod.def as z.core.$ZodObjectDef);
        case "boolean":
            return simple_type('boolean');
        case "date":
            return simple_type_with_format('string', 'date-time');
        case "undefined":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`)
        case "null":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`)
        case "array" :
            return parse_array(zod_definition._zod.def as z.core.$ZodArrayDef);
        case "nullable":
            // stuff is nullable in mongodb by default, so just return the ordinary results of the parse
            //@ts-expect-error
            return zod_to_openapi_schema((zod_definition as z.core.$ZodNullable)._zod.def.innerType)
        case "optional":
            //return parse_optional(zod_definition._zod.def as z.core.$ZodOptionalDef);
            //@ts-ignore
            return zod_to_openapi_schema((zod_definition._zod.def as z.core.$ZodOptionalDef).innerType)
        case "map":
            return parse_map(zod_definition._zod.def as z.core.$ZodMapDef);
        case "any" :
            result = { AnyValue: {} };
        case "default":
            return parse_default(zod_definition._zod.def as z.core.$ZodDefaultDef);
        case "enum":
            return parse_enum(zod_definition._zod.def as z.core.$ZodEnumDef);
        case "readonly":
            throw new Error(`Zod type not yet supported in openapi interpreter: ${zod_definition._zod.def.type});`)
        case "pipe":
            if((zod_definition._zod.def as ZodPipe).in._zod.def.type === 'string') {
                //@ts-ignore
                return query_array(simple_type('string'))
            }
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type + "with intype " + (zod_definition._zod.def as ZodPipe).in._zod.def.type);
        case "custom":
            if(!magic_values.has(zod_definition)) {
                throw new Error(`could not find custom parser in the magic value dictionary`)
            }
            let { override_type } = magic_values.get(zod_definition);

            if(override_type === 'mongodb_id'){
                result = simple_type('string');
            } else {
                throw new Error(`could not find custom parser for ${override_type} in the magic value dictionary`)
            }
            return result;
        default:
            console.error(zod_definition._zod.def)
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type);
    }
}

export function parse_object(def: z.core.$ZodObjectDef): SchemaObject {
    let properties = {} as { [propertyName: string]: SchemaObject | ReferenceObject; };
    for(let [key, value] of Object.entries(def.shape)){
        properties[key] = zod_to_openapi_schema(value as z.ZodTypeAny);
    }
    return {
        type: "object",
        properties: properties
    };
}

export function parse_array(def: z.core.$ZodArrayDef): SchemaObject {
    let retval: SchemaObject = {
        type: 'array',
        //@ts-ignore
        items: zod_to_openapi_schema(def.element)
    };
    return retval;
}

function parse_map(def: z.core.$ZodMapDef): SchemaObject {
    return {
        type: 'object',
        additionalProperties: zod_to_openapi_schema(def.valueType as z.ZodTypeAny)
    };
}

function parse_enum(def: z.core.$ZodEnumDef): SchemaObject {
    console.log(Object.values(def.entries))
    let retval: SchemaObject = {
        type: 'string',
        //@ts-ignore
        //enum: def.entries
        oneOf: Object.values(def.entries).map(ele => {
            return {
                title: ele,
                const: ele
            }
        })
    };
    return retval;
}

function parse_default(def: z.core.$ZodDefaultDef): SchemaObject {
    let type_definition = zod_to_openapi_schema(def.innerType as z.ZodTypeAny);
    type_definition.default = def.defaultValue;
    return type_definition;
}

export function query_validator_to_query_parameters(query_validator: z.ZodObject) {
    let parameters = [] as ParameterObject[];
    for(let [key, value] of Object.entries(query_validator._zod.def.shape)){
        parameters.push({
            in: 'query',
            name: key,
            schema: zod_to_openapi_schema(value)
        })
    }
    return parameters;
}

export function success_multiple_response(internal_schema: SchemaObject): ResponseObject {
    return {
        description: 'error',
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: {
                        'data': {
                            type: 'array',
                            items: internal_schema
                        }
                    }
                }
            }
        }
    }
}

export function openAPI_from_collection<Collection_ID extends string, ZodSchema extends z.ZodType>(builder: OpenApiBuilder, api_prefix: string, collection: F_Collection<Collection_ID, ZodSchema>){
    for(let access_layers of collection.access_layers){
        let base_layers_path_components = access_layers.layers.flatMap(ele => [ele, `{${ele}}`]);

        let document_path = [
            api_prefix,
            ...base_layers_path_components,
            `${collection.collection_id}/{document_id}`
        ].join('/')

        let collection_path = [
            api_prefix,
            ...base_layers_path_components,
            collection.collection_id
        ].join('/')
    
        builder.addPath(document_path, {
            get: {
                parameters: [...access_layers.layers.map(ele => ele), 'document_id'].map(ele => path_parameter(ele)),
                responses: {
                    '200': success(zod_to_openapi_schema(collection.schema)),
                    '403': error(),
                    '500': error(),
                }
            },
            put: {
                parameters: [...access_layers.layers.map(ele => ele), 'document_id'].map(ele => path_parameter(ele)),
                responses: {
                    '200': success(zod_to_openapi_schema(collection.schema)),
                    '403': error(),
                    '500': error(),
                },
                requestBody: {
                    content: {
                        'application/json': {
                            schema: zod_to_openapi_schema(collection.put_schema)
                        }
                    },
                    required: true,
                }
            },
            delete: {
                parameters: [...access_layers.layers.map(ele => ele), 'document_id'].map(ele => path_parameter(ele)),
                responses: {
                    '200': success(zod_to_openapi_schema(collection.schema)),
                    '403': error(),
                    '500': error(),
                }
            },
        });

        builder.addPath(collection_path, {
            get: {
                parameters: [
                    ...access_layers.layers.map(ele => ele).map(ele => path_parameter(ele)),
                    ...query_validator_to_query_parameters(collection.query_schema as unknown as z.ZodObject)
                ],
                responses: {
                    '200': success_multiple_response(zod_to_openapi_schema(collection.schema)),
                    '403': error(),
                    '500': error(),
                }
            },
            post: {
                parameters: access_layers.layers.map(ele => ele).map(ele => path_parameter(ele)),
                responses: {
                    '200': success(zod_to_openapi_schema(collection.schema)),
                    '403': error(),
                    '500': error(),
                },
                requestBody: {
                    content: {
                        'application/json': {
                            schema: zod_to_openapi_schema(collection.post_schema)
                        }
                    },
                    required: true,
                }
            }
        });
    }
}
