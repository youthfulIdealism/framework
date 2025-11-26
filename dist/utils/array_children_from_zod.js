import { find_loops } from './zod_loop_seperator.js';
export function array_children_from_zod(zod_definition, loop_detector, built_map, prefix = '') {
    let loops = loop_detector ?? find_loops(zod_definition);
    let results = built_map ?? new Map();
    for (let [key, value] of Object.entries(zod_definition.shape)) {
        if (loops.has(value._zod.def)) {
            continue;
        }
        let real_value = distill_zod(value);
        switch (real_value._zod.def.type) {
            case "object":
                array_children_from_zod(real_value, loop_detector, results, prefix.length > 0 ? `${prefix}.${key}` : key);
                break;
            case "array":
                let element = distill_zod(real_value.element);
                if (element._zod.def.type === 'object') {
                    results.set(prefix.length > 0 ? `${prefix}.${key}` : key, element);
                }
                break;
            default:
                break;
        }
    }
    return results;
}
function distill_zod(zod_definition) {
    switch (zod_definition._zod.def.type) {
        case "nullable":
            return zod_definition._zod.def.innerType;
        case "optional":
            return zod_definition._zod.def.innerType;
        default:
            return zod_definition;
    }
}
//# sourceMappingURL=array_children_from_zod.js.map