import { indent } from "./tab_indent.js";
import { find_loops } from '../../utils/zod_loop_seperator.js';
export function type_from_zod(zod_definition) {
    let loops = find_loops(zod_definition);
    let results = parse_zod(zod_definition, 0, loops);
    for (let [key, loop] of loops.entries()) {
        let loop_type = parse_zod(loop.validator, 0, loops, loop.def);
        results.push(`type ${loop.meta.name} = ${loop_type[0]}`, ...loop_type.slice(1));
    }
    return results;
}
export function parse_zod(zod_definition, indent_level, loop_detector, skip_once) {
    if (!zod_definition._zod) {
        console.log('ISSUE');
        console.log(zod_definition);
    }
    switch (zod_definition._zod.def.type) {
        case "string":
            return ['string'];
        case "number":
        case "int":
            return ['number'];
        case "object":
            return parse_object(zod_definition._zod.def, indent_level, loop_detector, skip_once);
        case "boolean":
            return ['boolean'];
        case "date":
            return ['Date'];
        case "undefined":
            return ['undefined'];
        case "null":
            return ['null'];
        case "array":
            return parse_array(zod_definition._zod.def, indent_level, loop_detector, skip_once);
        case "any":
            return ["any"];
        case "nullable":
            return [...parse_zod(zod_definition._zod.def.innerType, indent_level, loop_detector, skip_once), ` | null`];
        case "union":
            return parse_union(zod_definition._zod.def, indent_level, loop_detector, skip_once);
        case "record":
            return parse_record(zod_definition._zod.def, indent_level, loop_detector, skip_once);
        case "enum":
            return parse_enum(zod_definition._zod.def);
        case "readonly":
            throw new Error(`Zod type not yet supported by type_from_zod: ${zod_definition._zod.def.type});`);
        case "default":
            return parse_zod(zod_definition._zod.def.innerType, indent_level, loop_detector, skip_once);
        case "custom":
            let result = [];
            if (!zod_definition.meta()) {
                throw new Error(`could not find custom parser in the magic value dictionary for type_from_zod`);
            }
            let { framework_override_type } = zod_definition.meta();
            if (framework_override_type === 'mongodb_id') {
                result = ['string'];
            }
            else {
                throw new Error(`could not find custom parser for ${framework_override_type} in the magic value dictionary`);
            }
            return result;
        default:
            throw new Error("Cannot process zod type: " + zod_definition._zod.def.type);
    }
}
function parse_object(def, indent_level, loop_detector, skip_once) {
    if (loop_detector.has(def) && def !== skip_once) {
        let loop = loop_detector.get(def);
        let zod_object = loop.validator;
        if (!loop.meta.name && zod_object.meta()?.id) {
            loop.meta.name = `type_${zod_object.meta().id}`;
        }
        if (!loop.meta.name) {
            loop.meta.name = `type_${randomString()}`;
        }
        return [loop.meta.name];
    }
    ;
    let retval = ['{'];
    for (let [key, value] of Object.entries(def.shape)) {
        let key_phrase = (value.safeParse(undefined).success || value._zod.def.type === 'optional') ? `"${key}"?:` : `"${key}":`;
        let non_optional_type = value;
        while (non_optional_type._zod.def.type === 'optional') {
            non_optional_type = non_optional_type._zod.def.innerType;
        }
        let type_value = parse_zod(non_optional_type, indent_level + 1, loop_detector, def === skip_once ? undefined : skip_once);
        if (type_value.length > 1) {
            retval.push(indent(indent_level + 1, `${key_phrase} ${type_value[0]}`));
            retval.push(...type_value.slice(1));
        }
        else {
            retval.push(indent(indent_level + 1, `${key_phrase} ${type_value[0]}`));
        }
    }
    retval.push(indent(indent_level, '}'));
    return retval;
}
function parse_array(def, indent_level, loop_detector, skip_once) {
    let retval = parse_zod(def.element, indent_level + 1, loop_detector, skip_once);
    retval[retval.length - 1] = `${retval[retval.length - 1]}[]`;
    return retval;
}
function parse_enum(def) {
    return [`("${Object.values(def.entries).join('" | "')}")`];
}
function parse_record(def, indent_level, loop_detector, skip_once) {
    let retval = ['{'];
    let key_phrase = '';
    if (def.keyType.def.type === 'enum') {
        key_phrase = `[key in ${parse_zod(def.keyType, indent_level + 1, loop_detector, skip_once)}]:`;
    }
    else {
        key_phrase = `[key: ${parse_zod(def.keyType, indent_level + 1, loop_detector, skip_once)}]:`;
    }
    let type_value = parse_zod(def.valueType, indent_level + 1, loop_detector, skip_once);
    if (type_value.length > 1) {
        retval.push(indent(indent_level + 1, `${key_phrase} ${type_value[0]}`));
        retval.push(...type_value.slice(1));
    }
    else {
        retval.push(indent(indent_level + 1, `${key_phrase} ${type_value[0]}`));
    }
    retval.push(indent(indent_level, '}'));
    return retval;
}
function parse_union(def, indent_level, loop_detector, skip_once) {
    let results = def.options.map(ele => parse_zod(ele, indent_level, loop_detector, skip_once));
    let out = [];
    for (let q = 0; q < results.length; q++) {
        out.push(...results[q]);
        if (q !== results.length - 1) {
            out[out.length - 1] = out[out.length - 1] + ' | ';
        }
    }
    return out;
}
const random_string_chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function randomString(length = 16) {
    var result = '';
    for (let i = length; i > 0; --i)
        result += random_string_chars[Math.floor(Math.random() * random_string_chars.length)];
    return result;
}
//# sourceMappingURL=type_from_zod.js.map