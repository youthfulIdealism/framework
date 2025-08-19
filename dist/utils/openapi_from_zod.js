import { magic_values } from './mongoose_from_zod.js';
export function zod_to_openapi_schema(zod_definition) {
    let result;
    switch (zod_definition._zod.def.type) {
        case "string":
            return openapi_simple('string');
        case "number":
        case "int":
            return openapi_simple('number');
        case "object":
            return zod_object_to_openapi_schema(zod_definition._zod.def);
        case "boolean":
            return openapi_simple('boolean');
        case "date":
            return openapi_simple_format('string', 'date-time');
        case "undefined":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`);
        case "null":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`);
        case "array":
            return zod_array_to_openapi_schema(zod_definition._zod.def);
        case "nullable":
            return zod_to_openapi_schema(zod_definition._zod.def.innerType);
        case "optional":
            return zod_to_openapi_schema(zod_definition._zod.def.innerType);
        case "map":
            return zod_map_to_openapi_schema(zod_definition._zod.def);
        case "any":
            result = { AnyValue: {} };
        case "default":
            return zod_default_to_openapi_schema(zod_definition._zod.def);
        case "enum":
            return zod_enum_to_openapi_schema(zod_definition._zod.def);
        case "readonly":
            throw new Error(`Zod type not yet supported in openapi interpreter: ${zod_definition._zod.def.type});`);
        case "pipe":
            if (zod_definition._zod.def.in._zod.def.type === 'string') {
                return openapi_query_array(openapi_simple('string'));
            }
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type + "with intype " + zod_definition._zod.def.in._zod.def.type);
        case "custom":
            if (!magic_values.has(zod_definition)) {
                throw new Error(`could not find custom parser in the magic value dictionary`);
            }
            let { override_type } = magic_values.get(zod_definition);
            if (override_type === 'mongodb_id') {
                result = openapi_simple('string');
            }
            else {
                throw new Error(`could not find custom parser for ${override_type} in the magic value dictionary`);
            }
            return result;
        default:
            console.error(zod_definition._zod.def);
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type);
    }
}
export function zod_object_to_openapi_schema(def) {
    let properties = {};
    for (let [key, value] of Object.entries(def.shape)) {
        properties[key] = zod_to_openapi_schema(value);
    }
    return {
        type: "object",
        properties: properties
    };
}
export function zod_array_to_openapi_schema(def) {
    let retval = {
        type: 'array',
        items: zod_to_openapi_schema(def.element)
    };
    return retval;
}
function zod_map_to_openapi_schema(def) {
    return {
        type: 'object',
        additionalProperties: zod_to_openapi_schema(def.valueType)
    };
}
function zod_enum_to_openapi_schema(def) {
    console.log(def.entries);
    let retval = {
        type: 'string',
        oneOf: Object.values(def.entries).map(ele => {
            return {
                title: ele,
                const: ele
            };
        })
    };
    return retval;
}
function zod_default_to_openapi_schema(def) {
    let type_definition = zod_to_openapi_schema(def.innerType);
    type_definition.default = def.defaultValue;
    return type_definition;
}
export function openapi_ref(ref) {
    return {
        "$ref": `#/components/schemas/${ref}`
    };
}
export function openapi_array(items) {
    return {
        type: "array",
        items: items
    };
}
export function openapi_query_array(items) {
    return {
        type: "array",
        items: items,
        style: 'form',
        explode: false,
    };
}
export function openapi_simple(type) {
    return { type: type };
}
export function openapi_simple_format(type, format) {
    return {
        type: "string",
        format: format,
    };
}
export function access_layer_to_path_parameter(layer_name) {
    return {
        in: 'path',
        name: layer_name,
        schema: {
            type: 'string'
        },
        required: true,
    };
}
export function query_validator_to_query_parameters(query_validator) {
    let parameters = [];
    for (let [key, value] of Object.entries(query_validator._zod.def.shape)) {
        parameters.push({
            in: 'query',
            name: key,
            schema: zod_to_openapi_schema(value)
        });
    }
    return parameters;
}
export function error_response() {
    return {
        description: 'error',
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: {
                        'error': { type: 'string' }
                    }
                }
            }
        }
    };
}
export function success_response(internal_schema) {
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
    };
}
export function success_multiple_response(internal_schema) {
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
    };
}
export function openAPI_from_collection(builder, api_prefix, collection) {
    for (let access_layers of collection.access_layers) {
        let base_layers_path_components = access_layers.layers.flatMap(ele => [ele, `{${ele}}`]);
        let document_path = [
            api_prefix,
            ...base_layers_path_components,
            `${collection.collection_id}/{document_id}`
        ].join('/');
        let collection_path = [
            api_prefix,
            ...base_layers_path_components,
            collection.collection_id
        ].join('/');
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
                    ...query_validator_to_query_parameters(collection.query_schema)
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
//# sourceMappingURL=openapi_from_zod.js.map