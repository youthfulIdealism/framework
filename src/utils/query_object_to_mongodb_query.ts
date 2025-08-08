import { QueryWithHelpers } from "mongoose";

let complex_query_map = {
    '_gt': '$gt',
    '_lt': '$lt',
    '_gte': '$gte',
    '_lte': '$lte',
    /*'_ne': '$ne',
    '_starts_with': (key, value) => {
        return new RegExp('^' + escapeRegExp(value))
    },
    '_ends_with': (key, value) => {
        return new RegExp(escapeRegExp(value) + '$')
    },*/
    '_in': '$in'
}

let query_meta_map = {
    'limit': true,
    'cursor': true,
    'sort': true,
    'sort_order': true,
    //'projection': true,
}

export function query_object_to_mongodb_query(query_object: any){
    let retval = {} as any;

    for(let [key, value] of Object.entries(query_object)){
        if(Object.keys(query_meta_map).includes(key)){ continue; }
        let complex_suffix = Object.keys(complex_query_map).find(ele => key.endsWith(ele)) as keyof typeof complex_query_map;
        if (complex_suffix) {
            let modified_key = key.slice(0, -complex_suffix.length);

            if (!retval[modified_key]) { retval[modified_key] = {} as any; }
            retval[modified_key][complex_query_map[complex_suffix]] = value;
        } else {
            retval[key] = value;
        }
    }

    return retval;
}

export function query_object_to_mongodb_limits(query: QueryWithHelpers<any, any>, query_object: any, max_limit = 100) {
    if (query_object.sort) {
        let sort = {} as any;
        sort[query_object.sort] = query_object.sort_order ? query_object.sort_order : 'ascending';
        query.sort(sort)
    }

    if (query_object.sort_order && !query_object.sort) {
        query.sort({ '_id': query_object.sort_order })
    }

    if (query_object.limit) {
        query.limit(Math.min(Number.parseInt(query_object.limit), max_limit));
    } else {
        query.limit(max_limit);
    }

    if (query_object.cursor) {
        if (query_object.sort === '_id' && query_object.sort_order === 'descending') {
            query.sort({ '_id': 'descending' });
            query.lt('_id', query_object.cursor);
        } else {
            query.sort({ '_id': 'ascending' });
            query.gt('_id', query_object.cursor);
        }
    }

    return query;
} 