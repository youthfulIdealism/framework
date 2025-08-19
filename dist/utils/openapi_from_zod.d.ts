import { OpenApiBuilder, ParameterObject, ResponseObject, SchemaObject } from 'openapi3-ts/oas31';
import { F_Collection } from '../F_Collection.js';
import z from 'zod/v4';
export declare function zod_to_openapi_schema(zod_definition: z.ZodTypeAny): SchemaObject;
export declare function parse_object(def: z.core.$ZodObjectDef): SchemaObject;
export declare function parse_array(def: z.core.$ZodArrayDef): SchemaObject;
export declare function query_validator_to_query_parameters(query_validator: z.ZodObject): ParameterObject[];
export declare function success_multiple_response(internal_schema: SchemaObject): ResponseObject;
export declare function openAPI_from_collection<Collection_ID extends string, ZodSchema extends z.ZodType>(builder: OpenApiBuilder, api_prefix: string, collection: F_Collection<Collection_ID, ZodSchema>): void;
