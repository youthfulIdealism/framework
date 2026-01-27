import { QueryWithHelpers } from "mongoose";
export declare let complex_query_map: {
    _gt: string;
    _lt: string;
    _gte: string;
    _lte: string;
    _in: string;
    _search: (val: string) => {
        $regex: RegExp;
        $options: string;
    };
};
export declare let query_meta_map: {
    limit: boolean;
    cursor: boolean;
    sort: boolean;
    sort_order: boolean;
};
export declare function convert_null(query_object: any): any;
export declare function query_object_to_mongodb_query(query_object: {
    [key: string]: string | null;
}): any;
export declare function query_object_to_mongodb_limits(query: QueryWithHelpers<any, any>, query_object: any, max_limit?: number): import("mongoose").Query<any, any, {}, any, "find", Record<string, never>>;
