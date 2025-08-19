import { OpenApiBuilder, ParameterObject, ReferenceObject, ResponseObject, SchemaObject, SchemaObjectType } from 'openapi3-ts/oas31';
import { F_Collection } from '../F_Collection.js';
import z from 'zod/v4';
export declare function zod_to_openapi_schema(zod_definition: z.ZodTypeAny): SchemaObject;
export declare function zod_object_to_openapi_schema(def: z.core.$ZodObjectDef): SchemaObject;
export declare function zod_array_to_openapi_schema(def: z.core.$ZodArrayDef): SchemaObject;
export declare function openapi_ref(ref: string): {
    $ref: string;
};
export declare function openapi_array(items: SchemaObject | ReferenceObject): {
    type: string;
    items: SchemaObject | ReferenceObject;
};
export declare function openapi_query_array(items: SchemaObject | ReferenceObject): {
    type: string;
    items: SchemaObject | ReferenceObject;
    style: string;
    explode: boolean;
};
export declare function openapi_simple(type: SchemaObjectType): SchemaObject;
export declare function openapi_simple_format(type: SchemaObjectType, format: 'int32' | 'int64' | 'float' | 'double' | 'byte' | 'binary' | 'date' | 'date-time' | 'password'): SchemaObject;
export declare function access_layer_to_path_parameter(layer_name: string): ParameterObject;
export declare function query_validator_to_query_parameters(query_validator: z.ZodObject): ParameterObject[];
export declare function error_response(): ResponseObject;
export declare function success_response(internal_schema: SchemaObject): ResponseObject;
export declare function success_multiple_response(internal_schema: SchemaObject): ResponseObject;
export declare function openAPI_from_collection<Collection_ID extends string, ZodSchema extends z.ZodType>(builder: OpenApiBuilder, api_prefix: string, collection: F_Collection<Collection_ID, ZodSchema>): void;
