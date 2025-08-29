export function pretty_print(zod_definition) {
    console.log(parse_object(zod_definition._zod.def, new Set()));
}
function parse_any(zod_definition, loop_detector = new Set()) {
    switch (zod_definition._zod.def.type) {
        case "enum":
            return parse_enum(zod_definition._zod.def);
        case "string":
            return 'string';
        case "number":
        case "int":
            return 'number';
        case "object":
            return parse_object(zod_definition._zod.def, loop_detector);
        case "boolean":
            return 'boolean';
        case "date":
            return 'date';
        case "array":
            return parse_array(zod_definition._zod.def, loop_detector);
        case "union":
            return parse_union(zod_definition._zod.def);
        case "custom":
            if (!zod_definition.meta()) {
                throw new Error(`could not find custom parser in the magic value dictionary`);
            }
            let { framework_override_type } = zod_definition.meta();
            if (framework_override_type === 'mongodb_id') {
                return 'mongodb_id';
            }
            else {
                throw new Error(`could not find custom parser for ${framework_override_type} in the magic value dictionary`);
            }
        case "default":
            return parse_any(zod_definition._zod.def.innerType, loop_detector);
        case "optional":
            return parse_any(zod_definition._zod.def.innerType, loop_detector);
        default:
            return `unknown type ${zod_definition._zod.def.type}`;
    }
}
function parse_array(def, loop_detector) {
    return [parse_any(def.element, loop_detector)];
}
function parse_object(def, loop_detector) {
    if (loop_detector.has(def)) {
        return 'RECURSION';
    }
    loop_detector.add(def);
    let retval = {};
    for (let [key, value] of Object.entries(def.shape)) {
        retval[key] = parse_any(value, loop_detector);
    }
    return retval;
}
function parse_union(def) {
    return { or: def.options.map(ele => parse_any(ele)) };
}
function parse_enum(definition) {
    return { enum: definition.entries };
}
//# sourceMappingURL=pretty_print_zod.js.map