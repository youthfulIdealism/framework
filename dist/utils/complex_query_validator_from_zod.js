import { z } from "zod/v4";
import { z_mongodb_id } from "./mongoose_from_zod.js";
import { find_loops } from './zod_loop_seperator.js';
export function complex_query_validator_from_zod(zod_definition, mode = 'server') {
    let loops = find_loops(zod_definition);
    let object_filter = {};
    let object_filters = parse_object(zod_definition._zod.def, '', loops, mode);
    for (let filter of object_filters) {
        object_filter[filter.path.slice(1)] = filter.filter;
    }
    let compiled_object_filter = z.object(object_filter);
    let and = z.object({
        get $and() { return z.array(z.union([and, or, compiled_object_filter])); },
    });
    let or = z.object({
        get $or() { return z.array(z.union([and, or, compiled_object_filter])); },
    });
    return z.union([and, or]);
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
    return [
        {
            path: prefix,
            filter: z.union([
                z.object({
                    $eq: z.string()
                }),
                z.object({
                    $in: z.array(z.string())
                }),
                z.object({
                    $nin: z.array(z.string())
                }),
            ]).optional(),
            sortable: true,
        },
    ];
}
function parse_enum(definition, prefix, mode) {
    return [
        {
            path: prefix,
            filter: z.union([
                z.object({
                    $eq: z.enum(definition.entries)
                }),
                z.object({
                    $in: z.array(z.enum(definition.entries))
                }),
            ]).optional(),
            sortable: true,
        }
    ];
}
function parse_boolean(prefix, mode) {
    return [{
            path: prefix,
            filter: z.object({
                $eq: z.boolean()
            }).optional(),
            sortable: true,
        }];
}
function parse_number(prefix, mode) {
    return [{
            path: prefix,
            filter: z.union([
                z.object({
                    $eq: z.number()
                }),
                z.object({
                    $gt: z.number()
                }),
                z.object({
                    $lt: z.number()
                }),
                z.object({
                    $gte: z.number()
                }),
                z.object({
                    $lte: z.number()
                }),
            ]).optional(),
            sortable: true,
        }];
}
function parse_date(prefix, mode) {
    let date_parser = mode === 'client' ? z.date() : z.coerce.date();
    return [{
            path: prefix,
            filter: z.union([
                z.object({
                    $eq: date_parser
                }),
                z.object({
                    $gt: date_parser
                }),
                z.object({
                    $lt: date_parser
                }),
                z.object({
                    $gte: date_parser
                }),
                z.object({
                    $lte: date_parser
                }),
            ]).optional(),
            sortable: true,
        }];
}
function parse_mongodb_id(prefix, mode) {
    return [
        {
            path: prefix,
            filter: z.union([
                z.object({
                    $eq: z_mongodb_id
                }),
                z.object({
                    $gt: z_mongodb_id
                }),
                z.object({
                    $lt: z_mongodb_id
                }),
                z.object({
                    $gte: z_mongodb_id
                }),
                z.object({
                    $lte: z_mongodb_id
                }),
                z.object({
                    $in: z.array(z_mongodb_id)
                }),
                z.object({
                    $nin: z.array(z_mongodb_id)
                }),
            ]).optional(),
            sortable: true,
        }
    ];
}
//# sourceMappingURL=complex_query_validator_from_zod.js.map