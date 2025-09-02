export function is_validator_group(candidate) {
    return typeof candidate.handle === 'string' && candidate.validator;
}
export function find_loops(zod_definition) {
    let potential_loops = discover_loops(zod_definition);
    for (let [key, value] of potential_loops.entries()) {
        if (value.appearances <= 1) {
            potential_loops.delete(key);
        }
    }
    return potential_loops;
}
function discover_loops(zod_definition, validator_groups = new Map()) {
    if (!zod_definition) {
        console.error('ISSUE');
        console.error(zod_definition);
    }
    switch (zod_definition._zod.def.type) {
        case "object":
            parse_object(zod_definition._zod.def, validator_groups);
            break;
        case "array":
            discover_loops(zod_definition._zod.def.element, validator_groups);
            break;
        case "nullable":
        case "optional":
        case "default":
            discover_loops(zod_definition._zod.def.innerType, validator_groups);
            break;
        case "record":
            parse_record(zod_definition._zod.def, validator_groups);
            break;
        case "union":
            parse_union(zod_definition._zod.def, validator_groups);
            break;
        default:
            break;
    }
    return validator_groups;
}
function parse_object(def, validator_groups) {
    if (validator_groups.has(def)) {
        validator_groups.get(def).appearances++;
        return;
    }
    validator_groups.set(def, {
        appearances: 1,
        handle: ``,
        validator: def
    });
    for (let [key, value] of Object.entries(def.shape)) {
        discover_loops(value, validator_groups);
    }
}
function parse_record(def, validator_groups) {
    discover_loops(def.keyType, validator_groups);
    discover_loops(def.valueType, validator_groups);
}
function parse_union(def, validator_groups) {
    for (let option of def.options) {
        discover_loops(option, validator_groups);
    }
}
//# sourceMappingURL=zod_loop_seperator.js.map