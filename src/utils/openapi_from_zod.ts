import { OpenApiBuilder, ParameterObject, ReferenceObject, ResponseObject, SchemaObject, SchemaObjectType } from 'openapi3-ts/oas31';
import { F_Collection } from '../F_Collection.js';
import z, { ZodPipe } from 'zod/v4';
import { magic_values } from './mongoose_from_zod.js';
import { styleText } from 'util';

export function zod_to_openapi_schema(zod_definition: z.ZodTypeAny): SchemaObject {
    let result;
    switch (zod_definition._zod.def.type) {
        case "string":
            return openapi_simple('string');
        case "number":
        case "int":
            return openapi_simple('number');
        case "object":
            return zod_object_to_openapi_schema(zod_definition._zod.def as z.core.$ZodObjectDef);
        case "boolean":
            return openapi_simple('boolean');
        case "date":
            return openapi_simple_format('string', 'date-time');
        case "undefined":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`)
        case "null":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`)
        case "array" :
            return zod_array_to_openapi_schema(zod_definition._zod.def as z.core.$ZodArrayDef);
        case "nullable":
            // stuff is nullable in mongodb by default, so just return the ordinary results of the parse
            //@ts-expect-error
            return zod_to_openapi_schema((zod_definition as z.core.$ZodNullable)._zod.def.innerType)
        case "optional":
            //return parse_optional(zod_definition._zod.def as z.core.$ZodOptionalDef);
            //@ts-ignore
            return zod_to_openapi_schema((zod_definition._zod.def as z.core.$ZodOptionalDef).innerType)
        case "map":
            return zod_map_to_openapi_schema(zod_definition._zod.def as z.core.$ZodMapDef);
        case "any" :
            result = { AnyValue: {} };
        case "default":
            return zod_default_to_openapi_schema(zod_definition._zod.def as z.core.$ZodDefaultDef);
        case "enum":
            return zod_enum_to_openapi_schema(zod_definition._zod.def as z.core.$ZodEnumDef);
        case "readonly":
            throw new Error(`Zod type not yet supported in openapi interpreter: ${zod_definition._zod.def.type});`)
        case "pipe":
            if((zod_definition._zod.def as ZodPipe).in._zod.def.type === 'string') {
                //@ts-ignore
                return openapi_query_array(openapi_simple('string'))
            }
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type + "with intype " + (zod_definition._zod.def as ZodPipe).in._zod.def.type);
        case "custom":
            if(!magic_values.has(zod_definition)) {
                throw new Error(`could not find custom parser in the magic value dictionary`)
            }
            let { override_type } = magic_values.get(zod_definition);

            if(override_type === 'mongodb_id'){
                result = openapi_simple('string');
            } else {
                throw new Error(`could not find custom parser for ${override_type} in the magic value dictionary`)
            }
            return result;
        default:
            console.error(zod_definition._zod.def)
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type);
    }
}

export function zod_object_to_openapi_schema(def: z.core.$ZodObjectDef): SchemaObject {
    let properties = {} as { [propertyName: string]: SchemaObject | ReferenceObject; };
    for(let [key, value] of Object.entries(def.shape)){
        properties[key] = zod_to_openapi_schema(value as z.ZodTypeAny);
    }
    return {
        type: "object",
        properties: properties
    };
}

export function zod_array_to_openapi_schema(def: z.core.$ZodArrayDef): SchemaObject {
    let retval: SchemaObject = {
        type: 'array',
        //@ts-ignore
        items: zod_to_openapi_schema(def.element)
    };
    return retval;
}

function zod_map_to_openapi_schema(def: z.core.$ZodMapDef): SchemaObject {
    return {
        type: 'object',
        additionalProperties: zod_to_openapi_schema(def.valueType as z.ZodTypeAny)
    };
}

function zod_enum_to_openapi_schema(def: z.core.$ZodEnumDef): SchemaObject {
    console.log(def.entries)
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


function zod_default_to_openapi_schema(def: z.core.$ZodDefaultDef): SchemaObject {
    let type_definition = zod_to_openapi_schema(def.innerType as z.ZodTypeAny);
    type_definition.default = def.defaultValue;
    return type_definition;
}

export function openapi_ref(ref: string){
    return {
        "$ref": `#/components/schemas/${ref}`
    }
}

export function openapi_array(items: SchemaObject | ReferenceObject){
    return {
        type: "array",
        items: items
    }
}

export function openapi_query_array(items: SchemaObject | ReferenceObject){
    return {
        type: "array",
        items: items,
        style: 'form',
        explode: false,
    }
}

export function openapi_simple(type: SchemaObjectType): SchemaObject  {
    return { type: type }
}

export function openapi_simple_format(
    type: SchemaObjectType,
    format: 'int32' | 'int64' | 'float' | 'double' | 'byte' | 'binary' | 'date' | 'date-time' | 'password'
): SchemaObject  {
    return {
        type: "string",
        format: format,
    }
}

export function access_layer_to_path_parameter(layer_name: string): ParameterObject {
    return {
        in: 'path',
        name: layer_name,
        schema: {
            type: 'string'
        },
        required: true,
    }
}

// 'integer' | 'number' | 'string' | 'boolean' | 'object' | 'null' | 'array';
// 'int32' | 'int64' | 'float' | 'double' | 'byte' | 'binary' | 'date' | 'date-time' | 'password' | string;
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

export function error_response(): ResponseObject {
    return {
        description: 'error',
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: {
                        'error': { type: 'string'}
                    }
                }
            }
        }
    }
}

export function success_response(internal_schema: SchemaObject): ResponseObject {
    return {
        description: 'error',
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: {
                        'data': internal_schema
                    }
                }
            }
        }
    }
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
                parameters: [...access_layers.layers.map(ele => ele), 'document_id'].map(ele => access_layer_to_path_parameter(ele)),
                responses: {
                    '200': success_response(zod_to_openapi_schema(collection.schema)),
                    '403': error_response(),
                    '500': error_response(),
                }
            },
            put: {
                parameters: [...access_layers.layers.map(ele => ele), 'document_id'].map(ele => access_layer_to_path_parameter(ele)),
                responses: {
                    '200': success_response(zod_to_openapi_schema(collection.schema)),
                    '403': error_response(),
                    '500': error_response(),
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
                parameters: [...access_layers.layers.map(ele => ele), 'document_id'].map(ele => access_layer_to_path_parameter(ele)),
                responses: {
                    '200': success_response(zod_to_openapi_schema(collection.schema)),
                    '403': error_response(),
                    '500': error_response(),
                }
            },
        });

        builder.addPath(collection_path, {
            get: {
                parameters: [
                    ...access_layers.layers.map(ele => ele).map(ele => access_layer_to_path_parameter(ele)),
                    ...query_validator_to_query_parameters(collection.query_schema as unknown as z.ZodObject)
                ],
                responses: {
                    '200': success_multiple_response(zod_to_openapi_schema(collection.schema)),
                    '403': error_response(),
                    '500': error_response(),
                }
            },
            post: {
                parameters: access_layers.layers.map(ele => ele).map(ele => access_layer_to_path_parameter(ele)),
                responses: {
                    '200': success_response(zod_to_openapi_schema(collection.schema)),
                    '403': error_response(),
                    '500': error_response(),
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