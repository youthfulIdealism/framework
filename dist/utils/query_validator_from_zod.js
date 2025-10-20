import { z } from "zod/v4";
import { z_mongodb_id_nullable, z_mongodb_id_optional } from "./mongoose_from_zod.js";
import { find_loops } from './zod_loop_seperator.js';
export function query_validator_from_zod(zod_definition, mode = 'server') {
    let loops = find_loops(zod_definition);
    let retval = {
        limit: z.coerce.number().int().optional(),
        cursor: z_mongodb_id_optional,
        sort_order: z.enum(['ascending', 'descending']).optional()
    };
    let object_filters = parse_object(zod_definition._zod.def, '', loops, mode);
    for (let filter of object_filters) {
        retval[filter.path.slice(1)] = filter.filter;
    }
    retval.sort = z.enum(object_filters.filter(ele => ele.sortable).map(ele => ele.path.slice(1))).optional();
    return z.object(retval).strict();
}
function parse_any(zod_definition, prefix, loop_detector, mode = 'server') {
    switch (zod_definition._zod.def.type) {
        case "enum":
            return parse_enum(zod_definition._zod.def, prefix, mode);
        case "string":
            return parse_string(prefix, mode);
        case "number":
        case "int":
            return parse_number(prefix, mode);
        case "object":
            return parse_object(zod_definition._zod.def, prefix, loop_detector, mode);
        case "boolean":
            return parse_boolean(prefix, mode);
        case "date":
            return parse_date(prefix, mode);
        case "array":
            return parse_array(zod_definition._zod.def, prefix, loop_detector, mode);
        case "union":
            return parse_union(zod_definition._zod.def, prefix, mode);
        case "custom":
            if (!zod_definition.meta()) {
                throw new Error(`could not find custom parser in the magic value dictionary`);
            }
            let { framework_override_type } = zod_definition.meta();
            if (framework_override_type === 'mongodb_id') {
                return parse_mongodb_id(prefix, mode);
            }
            else {
                throw new Error(`could not find custom parser for ${framework_override_type} in the magic value dictionary`);
            }
        case "default":
            return parse_any(zod_definition._zod.def.innerType, prefix, loop_detector, mode);
        default:
            return [];
    }
}
function parse_array(def, prefix, loop_detector, mode) {
    let simple_children = ['enum', 'string', 'number', 'int', 'boolean'];
    if (simple_children.includes(def.element._zod.def.type)) {
        return parse_any(def.element, prefix, loop_detector, mode).filter(ele => ele.path == prefix);
    }
    else if (def.element._zod.def.type === 'custom') {
        if (!def.element.meta()) {
            return [];
        }
        let { framework_override_type } = def.element.meta();
        if (framework_override_type === 'mongodb_id') {
            return parse_mongodb_id(prefix, mode).filter(ele => ele.path == prefix);
        }
    }
    return [];
}
function parse_object(def, prefix, loop_detector, mode) {
    if (loop_detector.has(def)) {
        return [];
    }
    let retval = [];
    for (let [key, value] of Object.entries(def.shape)) {
        let filters = parse_any(value, `${prefix}.${key}`, loop_detector, mode);
        retval.push(...filters);
    }
    return retval;
}
function parse_union(def, prefix, mode) {
    let simple_children = ['enum', 'string', 'number', 'int', 'boolean'];
    let filter_queue = def.options.slice().filter(ele => simple_children.includes(ele._zod.def.type));
    if (filter_queue.length === 0) {
        return [];
    }
    let root = filter_queue.shift();
    for (let filter of filter_queue) {
        root = root.or(filter);
    }
    return [
        {
            path: prefix,
            filter: root,
            sortable: true,
        }
    ];
}
function parse_string(prefix, mode) {
    let array_parser = mode === 'client' ? z.array(z.string()) : z.string().transform(val => val.split(',').filter(ele => ele.length > 0));
    return [
        {
            path: prefix,
            filter: z.string().optional(),
            sortable: true,
        },
        {
            path: prefix + '_gt',
            filter: z.string().optional(),
            sortable: false,
        },
        {
            path: prefix + '_lt',
            filter: z.string().optional(),
            sortable: false,
        },
        {
            path: prefix + '_in',
            filter: array_parser.optional(),
            sortable: false,
        },
    ];
}
function parse_enum(definition, prefix, mode) {
    let array_parser = mode === 'client' ? z.array(z.enum(definition.entries)) : z.string().transform(val => val.split(',').filter(ele => ele.length > 0));
    return [
        {
            path: prefix,
            filter: z.enum(definition.entries).optional(),
            sortable: true,
        },
        {
            path: prefix + '_in',
            filter: array_parser.optional(),
            sortable: false,
        },
    ];
}
function parse_boolean(prefix, mode) {
    let boolean_parser = mode === 'client' ? z.boolean() : z.stringbool();
    return [{
            path: prefix,
            filter: boolean_parser.optional(),
            sortable: true,
        }];
}
function parse_number(prefix, mode) {
    let number_parser = mode === 'client' ? z.number() : z.coerce.number();
    return [
        {
            path: prefix,
            filter: number_parser.optional(),
            sortable: true,
        },
        {
            path: prefix + '_gt',
            filter: number_parser.optional(),
            sortable: false,
        },
        {
            path: prefix + '_gte',
            filter: number_parser.optional(),
            sortable: false,
        },
        {
            path: prefix + '_lt',
            filter: number_parser.optional(),
            sortable: false,
        },
        {
            path: prefix + '_lte',
            filter: number_parser.optional(),
            sortable: false,
        },
    ];
}
function parse_date(prefix, mode) {
    let date_parser = mode === 'client' ? z.date() : z.coerce.date();
    return [{
            path: prefix,
            filter: date_parser.optional(),
            sortable: true,
        },
        {
            path: prefix + '_gt',
            filter: date_parser.optional(),
            sortable: false,
        },
        {
            path: prefix + '_lt',
            filter: date_parser.optional(),
            sortable: false,
        }];
}
function parse_mongodb_id(prefix, mode) {
    let array_parser = mode === 'client' ? z.array(z_mongodb_id_nullable) : z.string().transform(val => val.split(',').filter(ele => ele.length > 0));
    return [
        {
            path: prefix,
            filter: z_mongodb_id_nullable.optional(),
            sortable: true,
        },
        {
            path: prefix + '_gt',
            filter: z_mongodb_id_nullable.optional(),
            sortable: false,
        },
        {
            path: prefix + '_lt',
            filter: z_mongodb_id_nullable.optional(),
            sortable: false,
        },
        {
            path: prefix + '_in',
            filter: array_parser.optional(),
            sortable: false,
        },
    ];
}
//# sourceMappingURL=query_validator_from_zod.js.map