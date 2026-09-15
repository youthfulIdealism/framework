import { z } from "zod/v4"
import { $ZodLooseShape } from "zod/v4/core";
import { Types } from "mongoose";
import { z_mongodb_id } from "./mongoose_from_zod.js";
import { find_loops, validator_group } from './zod_loop_seperator.js'

type type_filter = {
    path: string,
    filter: z.ZodType,
    sortable: boolean,
}
type type_filters = type_filter[]
type Mode = 'client' | 'server'

export function query_validator_from_zod(zod_definition: z.ZodObject, mode: Mode = 'server'){
    let loops = find_loops(zod_definition as z.ZodType);

    let retval = {
        limit: z.coerce.number().int().optional(),
        cursor: z_mongodb_id.optional(),
        sort_order: z.enum([/*'asc', 'desc', */'ascending', 'descending']).optional(),
        advanced_query: z.string().optional(),
    } as $ZodLooseShape;

    let object_filters = parse_object(zod_definition._zod.def, '', loops, mode);
    for(let filter of object_filters){
        retval[filter.path.slice(1)] = filter.filter;
    }

    retval.sort = z.enum(object_filters.filter(ele => ele.sortable).map(ele => ele.path.slice(1))).optional()

    return z.object(retval).strict();
}

function parse_any(zod_definition: z.ZodTypeAny, prefix: string, loop_detector: Map<any, validator_group>, mode: Mode = 'server'): type_filters {
    switch (zod_definition._zod.def.type) {
        case "enum":
            return parse_enum(zod_definition._zod.def as z.core.$ZodEnumDef, prefix, mode);
        case "string":
            return parse_string(prefix, mode);
        case "number":
        case "int":
            return parse_number(prefix, mode);
        case "object":
            return parse_object(zod_definition._zod.def as z.core.$ZodObjectDef, prefix, loop_detector, mode);
        case "boolean":
            return parse_boolean(prefix, mode);
        case "date":
            return parse_date(prefix, mode);
        case "array":
            return parse_array(zod_definition._zod.def as z.core.$ZodArrayDef, prefix, loop_detector, mode)
        case "union":
            return parse_union(zod_definition._zod.def as z.core.$ZodUnionDef, prefix, loop_detector, mode)
        case "custom":
            if(!zod_definition.meta()) {
                throw new Error(`could not find custom parser in the magic value dictionary`)
            }
            let { framework_override_type } = zod_definition.meta();

            if(framework_override_type === 'mongodb_id'){
                return parse_mongodb_id(prefix, mode);
            } else {
                throw new Error(`could not find custom parser for ${framework_override_type} in the magic value dictionary`)
            }
        case "default":
            //@ts-ignore
            return parse_any((zod_definition._zod.def as z.core.$ZodDefaultDef).innerType, prefix, loop_detector, mode)
        case "optional":
            //@ts-ignore
            return parse_any((zod_definition._zod.def as z.core.$ZodDefaultDef).innerType, prefix, loop_detector, mode)
        case "nullable":
            //@ts-ignore
            return parse_nullable((zod_definition._zod.def as z.core.$ZodOptionalDef).innerType, prefix, loop_detector, mode)
        default:
            return []
    }
}

function parse_array(def: z.core.$ZodArrayDef, prefix: string, loop_detector: Map<any, validator_group>, mode: Mode) {
    let simple_children = ['enum', 'string', 'number', 'int', 'boolean']
    if(simple_children.includes(def.element._zod.def.type)) {
        //@ts-ignore
        return parse_any(def.element, prefix, loop_detector, mode).filter(ele => ele.path == prefix);
    } else if(def.element._zod.def.type === 'custom'){
        //@ts-ignore
        if(!def.element.meta()) {
            return [];
        }
        //@ts-ignore
        let { framework_override_type } = def.element.meta();

        if(framework_override_type === 'mongodb_id'){
            return parse_mongodb_id(prefix, mode).filter(ele => ele.path == prefix);
        }
    }

    return [];
}

function parse_object(def: z.core.$ZodObjectDef, prefix: string, loop_detector: Map<any, validator_group>, mode: Mode): type_filters {
    if(loop_detector.has(def)) {
        return [];
    }

    let retval = [] as type_filters;
    for(let [key, value] of Object.entries(def.shape)){
        //@ts-ignore
        let filters = parse_any(value, `${prefix}.${key}`, loop_detector, mode);
        retval.push(...filters);
    }
    return retval;
}

// `.or()` builds nested unions (`a.or(b).or(c)` === `union([union([a, b]), c])`)
// so a chain of 3+ options hides everything but the outermost couple of
// branches unless we recursively unwrap nested union options first.
function flatten_union_options(options: readonly z.core.$ZodType[]): z.core.$ZodType[] {
    return options.flatMap(option => option._zod.def.type === 'union' ? flatten_union_options((option._zod.def as z.core.$ZodUnionDef).options) : [option]);
}

// sibling object variants of a union can each contribute a filter at the same path. For example, the following filter
// z.object({
//      type: z.enum('oil'),
//      category: z.string()}
//  ).or(z.object({
//      type: z.enum('oil'),
//      category: z.number()
//  })));
// could product a string filter or a number filter for "category". By merging them,
// we prevent later variants from clobbering earlier ones.
function merge_type_filters_by_path(filters: type_filters): type_filters {
    let by_path = new Map<string, type_filter>();
    for(let filter of filters){
        let existing = by_path.get(filter.path);
        if(!existing){
            by_path.set(filter.path, filter);
        } else {
            by_path.set(filter.path, {
                path: filter.path,
                filter: existing.filter.or(filter.filter),
                sortable: existing.sortable && filter.sortable,
            });
        }
    }
    return Array.from(by_path.values());
}

function parse_union(def: z.core.$ZodUnionDef, prefix: string, loop_detector: Map<any, validator_group>, mode: Mode): type_filters {
    let options = flatten_union_options(def.options);

    let simple_children = ['enum', 'string', 'number', 'int', 'boolean']
    let filter_queue = options.slice().filter(ele => simple_children.includes(ele._zod.def.type));

    let complex_children = ['object'];
    let complex_entries = options.slice().filter(ele => complex_children.includes(ele._zod.def.type))
    //@ts-expect-error
    let complex_filters: type_filters = merge_type_filters_by_path(complex_entries.flatMap(ele => parse_any(ele, prefix, loop_detector, mode)));

    if(filter_queue.length === 0){ return complex_filters; }
    let simple_children_validator = filter_queue.shift();
    for(let filter of  filter_queue){
        //@ts-expect-error
        simple_children_validator = simple_children_validator.or(filter);
    }

    return [
        {
            path: prefix,
            //@ts-expect-error
            filter: simple_children_validator.optional(),
            sortable: true,
        },
        ...complex_filters
    ];
}

function parse_string(prefix: string, mode: Mode): type_filters {
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
                path: prefix + '_search',
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

function parse_enum(definition: z.core.$ZodEnumDef, prefix: string, mode: Mode): type_filters {
    // TODO: figure out how to validate on the server such that it's a member of the enu,
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

function parse_boolean(prefix: string, mode: Mode): type_filters {
    let boolean_parser = mode === 'client' ? z.boolean() : z.stringbool();
    return [{
        path: prefix,
        filter: boolean_parser.optional(),
        sortable: true,
    }];
}

function parse_number(prefix: string, mode: Mode): type_filters {
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

function parse_date(prefix: string, mode: Mode): type_filters {
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


function parse_mongodb_id(prefix: string, mode: Mode): type_filters {
    // server-mode filters always cast to a real ObjectId (rather than leaving a validated hex string)
    // so that equality/gt/lt/in filters work correctly even for a field nested inside a union, which
    // Mongoose stores as `Mixed` and therefore can't auto-cast a query value to ObjectId (see
    // mongoose_from_zod.ts's parse_union). Client-mode filters stay string, since that's what a browser
    // actually sends over a query string.
    let cast_to_object_id = mode === 'server';
    let array_parser = mode === 'client'
        ? z.array(z_mongodb_id)
        : z.string().transform((val): (string | Types.ObjectId)[] => {
            let ids = val.split(',').filter(ele => ele.length > 0);
            return cast_to_object_id ? ids.map(ele => new Types.ObjectId(ele)) : ids;
        });
    let object_id_filter = cast_to_object_id ? z_mongodb_id.transform(val => new Types.ObjectId(val)).optional() : z_mongodb_id.optional();
    return [
        {
            path: prefix,
            filter: object_id_filter,
            sortable: true,
        },
        {
            path: prefix + '_gt',
            filter: object_id_filter,
            sortable: false,
        },
        {
            path: prefix + '_lt',
            filter: object_id_filter,
            sortable: false,
        },
        {
            path: prefix + '_in',
            filter: array_parser.optional(),
            sortable: false,
        },
    ];
}

function parse_nullable(inner_type: z.ZodTypeAny, prefix: string, loop_detector: Map<any, validator_group>, mode: Mode = 'server'): type_filters {
    let inner = parse_any(inner_type, prefix, loop_detector, mode)
    for(let ele of inner){
        if([`${prefix}`, `${prefix}_in`].includes(ele.path)){
            ele.filter = ele.filter.nullable();
        }
    }

    return inner;
}