import { magic_values } from './mongoose_from_zod.js';
import { simple_type, simple_type_with_format, query_array, success, error, path_parameter } from './openapi_builder_utils.js';
export function zod_to_openapi_schema(zod_definition) {
    let result;
    switch (zod_definition._zod.def.type) {
        case "string":
            return simple_type('string');
        case "number":
        case "int":
            return simple_type('number');
        case "object":
            return parse_object(zod_definition._zod.def);
        case "boolean":
            return simple_type('boolean');
        case "date":
            return simple_type_with_format('string', 'date-time');
        case "undefined":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`);
        case "null":
            throw new Error(`Zod type not yet supported: ${zod_definition._zod.def.type});`);
        case "array":
            return parse_array(zod_definition._zod.def);
        case "nullable":
            return zod_to_openapi_schema(zod_definition._zod.def.innerType);
        case "optional":
            return zod_to_openapi_schema(zod_definition._zod.def.innerType);
        case "map":
            return parse_map(zod_definition._zod.def);
        case "any":
            result = { AnyValue: {} };
        case "default":
            return parse_default(zod_definition._zod.def);
        case "enum":
            return parse_enum(zod_definition._zod.def);
        case "readonly":
            throw new Error(`Zod type not yet supported in openapi interpreter: ${zod_definition._zod.def.type});`);
        case "pipe":
            if (zod_definition._zod.def.in._zod.def.type === 'string') {
                return query_array(simple_type('string'));
            }
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type + "with intype " + zod_definition._zod.def.in._zod.def.type);
        case "custom":
            if (!magic_values.has(zod_definition)) {
                throw new Error(`could not find custom parser in the magic value dictionary`);
            }
            let { override_type } = magic_values.get(zod_definition);
            if (override_type === 'mongodb_id') {
                result = simple_type('string');
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
export function parse_object(def) {
    let properties = {};
    for (let [key, value] of Object.entries(def.shape)) {
        properties[key] = zod_to_openapi_schema(value);
    }
    return {
        type: "object",
        properties: properties
    };
}
export function parse_array(def) {
    let retval = {
        type: 'array',
        items: zod_to_openapi_schema(def.element)
    };
    return retval;
}
function parse_map(def) {
    return {
        type: 'object',
        additionalProperties: zod_to_openapi_schema(def.valueType)
    };
}
function parse_enum(def) {
    console.log(Object.values(def.entries));
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
function parse_default(def) {
    let type_definition = zod_to_openapi_schema(def.innerType);
    type_definition.default = def.defaultValue;
    return type_definition;
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
                    ...query_validator_to_query_parameters(collection.query_schema)
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
//# sourceMappingURL=openapi_from_zod.js.map