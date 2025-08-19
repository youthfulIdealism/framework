import { SchemaObject, ReferenceObject, SchemaObjectType, ResponseObject, ParameterObject } from 'openapi3-ts/oas31';


export function ref(ref: string) {
    return {
        "$ref": `#/components/schemas/${ref}`
    };
}

export function array(items: SchemaObject | ReferenceObject) {
    return {
        type: "array",
        items: items
    };
}

export function query_array(items: SchemaObject | ReferenceObject) {
    return {
        type: "array",
        items: items,
        style: 'form',
        explode: false,
    };
}

export function simple_type(type: SchemaObjectType): SchemaObject {
    return { type: type };
}

export function simple_type_with_format(
    type: SchemaObjectType,
    format: 'int32' | 'int64' | 'float' | 'double' | 'byte' | 'binary' | 'date' | 'date-time' | 'password'
): SchemaObject {
    return {
        type: "string",
        format: format,
    };
}

export function path_parameter(layer_name: string): ParameterObject {
    return {
        in: 'path',
        name: layer_name,
        schema: {
            type: 'string'
        },
        required: true,
    }
}

export function error(): ResponseObject {
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

export function success(internal_schema: SchemaObject): ResponseObject {
    return {
        description: 'success',
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