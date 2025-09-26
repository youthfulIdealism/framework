import { QueryWithHelpers } from "mongoose";
export declare function convert_null(query_object: any): any;
export declare function query_object_to_mongodb_query(query_object: any): any;
export declare function query_object_to_mongodb_limits(query: QueryWithHelpers<any, any>, query_object: any, max_limit?: number): import("mongoose").Query<any, any, {}, any, "find", Record<string, never>>;
