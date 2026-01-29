import escapeStringRegexp from 'escape-string-regexp';
export let complex_query_map = {
    '_gt': '$gt',
    '_lt': '$lt',
    '_gte': '$gte',
    '_lte': '$lte',
    '_in': '$in',
    '_search': (val) => {
        return { $regex: new RegExp(escapeStringRegexp(val)), $options: 'i' };
    }
};
export let query_meta_map = {
    'limit': true,
    'cursor': true,
    'sort': true,
    'sort_order': true,
    'advanced_query': true,
};
export function convert_null(query_object) {
    for (let [key, value] of Object.entries(query_object)) {
        if (value === 'null') {
            query_object[key] = null;
        }
    }
    return query_object;
}
export function query_object_to_mongodb_query(query_object) {
    let retval = {};
    for (let [key, value] of Object.entries(query_object)) {
        if (Object.keys(query_meta_map).includes(key)) {
            continue;
        }
        let complex_suffix = Object.keys(complex_query_map).find(ele => key.endsWith(ele));
        if (complex_suffix) {
            let modified_key = key.slice(0, -complex_suffix.length);
            if (!retval[modified_key]) {
                retval[modified_key] = {};
            }
            if (typeof complex_query_map[complex_suffix] === 'string') {
                retval[modified_key][complex_query_map[complex_suffix]] = value;
            }
            else {
                retval[modified_key] = complex_query_map[complex_suffix](value);
            }
        }
        else {
            retval[key] = value;
        }
    }
    return retval;
}
export function query_object_to_mongodb_limits(query, query_object, max_limit = 100) {
    if (query_object.sort) {
        let sort = {};
        sort[query_object.sort] = query_object.sort_order ? query_object.sort_order : 'ascending';
        query = query.sort(sort);
    }
    if (query_object.sort_order && !query_object.sort) {
        query = query.sort({ '_id': query_object.sort_order });
    }
    if (query_object.limit) {
        query = query.limit(Math.min(Number.parseInt(query_object.limit), max_limit));
    }
    else {
        query = query.limit(max_limit);
    }
    if (query_object.cursor) {
        if ((query_object.sort === '_id' || query_object.sort === undefined) && query_object.sort_order === 'descending') {
            query = query.sort({ '_id': 'descending' });
            query = query.lt('_id', query_object.cursor);
        }
        else {
            query = query.sort({ '_id': 'ascending' });
            query = query.gt('_id', query_object.cursor);
        }
    }
    return query;
}
//# sourceMappingURL=query_object_to_mongodb_query.js.map