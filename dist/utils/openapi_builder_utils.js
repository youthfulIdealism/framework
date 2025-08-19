export function ref(ref) {
    return {
        "$ref": `#/components/schemas/${ref}`
    };
}
export function array(items) {
    return {
        type: "array",
        items: items
    };
}
export function query_array(items) {
    return {
        type: "array",
        items: items,
        style: 'form',
        explode: false,
    };
}
export function simple_type(type) {
    return { type: type };
}
export function simple_type_with_format(type, format) {
    return {
        type: "string",
        format: format,
    };
}
export function path_parameter(layer_name) {
    return {
        in: 'path',
        name: layer_name,
        schema: {
            type: 'string'
        },
        required: true,
    };
}
export function error() {
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
export function success(internal_schema) {
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
    };
}
//# sourceMappingURL=openapi_builder_utils.js.map