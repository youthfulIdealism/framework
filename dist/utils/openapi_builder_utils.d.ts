import { SchemaObject, ReferenceObject, SchemaObjectType, ResponseObject, ParameterObject } from 'openapi3-ts/oas31';
export declare function ref(ref: string): {
    $ref: string;
};
export declare function array(items: SchemaObject | ReferenceObject): {
    type: string;
    items: SchemaObject | ReferenceObject;
};
export declare function query_array(items: SchemaObject | ReferenceObject): {
    type: string;
    items: SchemaObject | ReferenceObject;
    style: string;
    explode: boolean;
};
export declare function simple_type(type: SchemaObjectType): SchemaObject;
export declare function simple_type_with_format(type: SchemaObjectType, format: 'int32' | 'int64' | 'float' | 'double' | 'byte' | 'binary' | 'date' | 'date-time' | 'password'): SchemaObject;
export declare function path_parameter(layer_name: string): ParameterObject;
export declare function error(): ResponseObject;
export declare function success(internal_schema: SchemaObject): ResponseObject;
