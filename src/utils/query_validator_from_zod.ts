import { z } from "zod/v4"
import { $ZodLooseShape } from "zod/v4/core";
import { magic_values, z_mongodb_id } from "./mongoose_from_zod.js";

type type_filters = {
    path: string,
    filter: z.ZodType,
    sortable: boolean,
}[]

export function query_validator_from_zod(zod_definition: z.ZodObject){
    let retval = {
        limit: z.coerce.number().int().optional(),
        cursor: z_mongodb_id.optional(),
        sort_order: z.enum([/*'asc', 'desc', */'ascending', 'descending']).optional()

    } as $ZodLooseShape;
    let object_filters = parse_object(zod_definition._zod.def, '');
    for(let filter of object_filters){
        retval[filter.path.slice(1)] = filter.filter;
    }

    retval.sort = z.enum(object_filters.filter(ele => ele.sortable).map(ele => ele.path.slice(1))).optional()

    return z.object(retval).strict();
}

function parse_any(zod_definition: z.ZodTypeAny, prefix: string): type_filters {
    let result;
    switch (zod_definition._zod.def.type) {
        case "enum":
        case "string":
            return parse_string(prefix);
        case "number":
        case "int":
            return parse_number(prefix);
        case "object":
            return parse_object(zod_definition._zod.def as z.core.$ZodObjectDef, prefix);
        case "boolean":
            return parse_boolean(prefix);
        case "date":
            return parse_date(prefix);
        case "array":
            return parse_array(zod_definition._zod.def as z.core.$ZodArrayDef, prefix)
        case "custom":
            if(!magic_values.has(zod_definition)) {
                throw new Error(`could not find custom parser in the magic value dictionary`)
            }
            let { override_type } = magic_values.get(zod_definition);

            if(override_type === 'mongodb_id'){
                return parse_mongodb_id(prefix);
            } else {
                throw new Error(`could not find custom parser for ${override_type} in the magic value dictionary`)
            }
        default:
            return []
    }
}

function parse_array(def: z.core.$ZodArrayDef, prefix: string) {
    let simple_children = ['enum', 'string', 'number', 'int', 'boolean']
    if(simple_children.includes(def.element._zod.def.type)) {
        //@ts-ignore
        return parse_any(def.element, prefix).filter(ele => ele.path == prefix)
    } else if(def.element._zod.def.type === 'custom'){
        if(!magic_values.has(def.element)) {
            return [];
        }
        let { override_type } = magic_values.get(def.element);

        if(override_type === 'mongodb_id'){
            return parse_mongodb_id(prefix).filter(ele => ele.path == prefix);
        }
    }
    
    return [];
}

function parse_object(def: z.core.$ZodObjectDef, prefix: string): type_filters {
    let retval = [] as type_filters;
    for(let [key, value] of Object.entries(def.shape)){
        //@ts-ignore
        let filters = parse_any(value, `${prefix}.${key}`);
        retval.push(...filters);
    }
    return retval;
}

function parse_string(prefix: string): type_filters {
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
            filter: z.string().transform(val => val.split(',').filter(ele => ele.length > 0)).optional(),
            sortable: false,
        },
    ];
}

function parse_boolean(prefix: string): type_filters {
    return [{
        path: prefix,
        filter: z.stringbool().optional(),
        sortable: true,
    }];
}

function parse_number(prefix: string): type_filters {
    return [
        {
            path: prefix,
            filter: z.coerce.number().optional(),
            sortable: true,
        },
        {
            path: prefix + '_gt',
            filter: z.coerce.number().optional(),
            sortable: false,
        },
        {
            path: prefix + '_gte',
            filter: z.coerce.number().optional(),
            sortable: false,
        },
        {
            path: prefix + '_lt',
            filter: z.coerce.number().optional(),
            sortable: false,
        },
        {
            path: prefix + '_lte',
            filter: z.coerce.number().optional(),
            sortable: false,
        },
    ];
}

function parse_date(prefix: string): type_filters {
    return [{
        path: prefix,
        filter: z.coerce.date().optional(),
        sortable: true,
    },
    {
        path: prefix + '_gt',
        filter: z.coerce.date().optional(),
        sortable: false,
    },
    {
        path: prefix + '_lt',
        filter: z.coerce.date().optional(),
        sortable: false,
    }];
}


function parse_mongodb_id(prefix: string): type_filters {
    return [
        {
            path: prefix,
            filter: z_mongodb_id.optional(),
            sortable: true,
        },
        {
            path: prefix + '_gt',
            filter: z_mongodb_id.optional(),
            sortable: false,
        },
        {
            path: prefix + '_lt',
            filter: z_mongodb_id.optional(),
            sortable: false,
        },
        {
            path: prefix + '_in',
            filter: z.string().transform(val => val.split(',').filter(ele => ele.length > 0)).optional(),
            sortable: false,
        },
    ];
}