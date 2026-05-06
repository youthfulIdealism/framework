import { find_loops } from './zod_loop_seperator.js';
export function array_children_from_zod(zod_definition, loop_detector, built_map, prefix = '') {
    let loops = loop_detector ?? find_loops(zod_definition);
    let results = built_map ?? new Map();
    for (let [key, value] of Object.entries(zod_definition.shape)) {
        if (loops.has(value._zod.def)) {
            continue;
        }
        let real_value = penetrate_nullable_optional(value);
        switch (real_value._zod.def.type) {
            case "object":
                array_children_from_zod(real_value, loop_detector, results, prefix.length > 0 ? `${prefix}.${key}` : key);
                break;
            case "array":
                let element = penetrate_nullable_optional(real_value.element);
                if (element._zod.def.type === 'object') {
                    let objdef = element._zod.def;
                    if (objdef.shape._id) {
                        results.set(prefix.length > 0 ? `${prefix}.${key}` : key, element);
                    }
                }
                break;
            default:
                break;
        }
    }
    return results;
}
export function penetrate_nullable_optional(zod_definition) {
    let current = zod_definition;
    while (['nullable', 'optional'].includes(current._zod.def.type)) {
        current = current._zod.def.innerType;
    }
    return current;
}
//# sourceMappingURL=array_children_from_zod.js.map