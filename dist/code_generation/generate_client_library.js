import { mkdir, readFile, writeFile } from "node:fs/promises";
import { type_from_zod } from "./utils/type_from_zod.js";
import mustache from 'mustache';
import { existsSync } from "node:fs";
import { fileURLToPath } from 'url';
import { normalize, join } from 'path';
function build_path(...args) {
    return normalize(join(...args));
}
export async function generate_client_library(output_path, collection_registry, service_name = 'default-service') {
    let api_builder = {
        mustache_context: {},
        children: {}
    };
    for (let col of Object.values(collection_registry.collections)) {
        let collection = col;
        let mustache_context = {
            collection_id: collection.collection_id,
            collection_name_plural: collection.collection_name_plural,
            type_return: `${get_type_name(collection.collection_id)}`,
            path_type_return: `types/${get_type_name(collection.collection_id)}`,
            type_query: `${get_type_name(collection.collection_id)}_query`,
            path_type_query: `types/${get_type_name(collection.collection_id)}_query`,
            type_put: `${get_type_name(collection.collection_id)}_put`,
            path_type_put: `types/${get_type_name(collection.collection_id)}_put`,
            type_post: `${get_type_name(collection.collection_id)}_post`,
            path_type_post: `types/${get_type_name(collection.collection_id)}_post`,
        };
        let collection_type_definition_builder = [];
        let collection_type_main = type_from_zod(collection.validator);
        collection_type_definition_builder.push(`export type ${mustache_context.type_return} = ${collection_type_main[0]}`, ...collection_type_main.slice(1));
        let collection_query_type_definition_builder = [];
        let collection_type_query = type_from_zod(collection.query_validator_client);
        collection_query_type_definition_builder.push(`export type ${mustache_context.type_query} = ${collection_type_query[0]}`, ...collection_type_query.slice(1));
        let collection_put_type_definition_builder = [];
        let collection_type_put = type_from_zod(collection.put_validator);
        collection_put_type_definition_builder.push(`export type ${mustache_context.type_put} = ${collection_type_put[0]}`, ...collection_type_put.slice(1));
        let collection_post_type_definition_builder = [];
        let collection_type_post = type_from_zod(collection.post_validator);
        collection_post_type_definition_builder.push(`export type ${mustache_context.type_post} = ${collection_type_post[0]}`, ...collection_type_post.slice(1));
        if (!existsSync(build_path(output_path, 'src'))) {
            await mkdir(build_path(output_path, 'src'));
        }
        if (!existsSync(build_path(output_path, 'dist'))) {
            await mkdir(build_path(output_path, 'dist'));
        }
        if (!existsSync(build_path(output_path, 'src', 'types'))) {
            await mkdir(build_path(output_path, 'src', 'types'));
        }
        if (!existsSync(build_path(output_path, 'src', 'utils'))) {
            await mkdir(build_path(output_path, 'src', 'utils'));
        }
        await writeFile(build_path(output_path, 'src', 'utils', 'utils.ts'), await readFile(fileURLToPath(import.meta.resolve('./templates/utils.ts.mustache')), { encoding: 'utf-8' }));
        await writeFile(build_path(output_path, 'tsconfig.json'), await readFile(fileURLToPath(import.meta.resolve('./templates/tsconfig.json.mustache')), { encoding: 'utf-8' }));
        await writeFile(build_path(output_path, '.gitignore'), await readFile(fileURLToPath(import.meta.resolve('./templates/.gitignore.mustache')), { encoding: 'utf-8' }));
        await writeFile(build_path(output_path, 'src', mustache_context.path_type_return + '.ts'), collection_type_definition_builder.join('\n'));
        await writeFile(build_path(output_path, 'src', mustache_context.path_type_query + '.ts'), collection_query_type_definition_builder.join('\n'));
        await writeFile(build_path(output_path, 'src', mustache_context.path_type_put + '.ts'), collection_put_type_definition_builder.join('\n'));
        await writeFile(build_path(output_path, 'src', mustache_context.path_type_post + '.ts'), collection_post_type_definition_builder.join('\n'));
        for (let access_layer of collection.access_layers) {
            let builder = get_builder(api_builder, access_layer.layers, collection, mustache_context);
        }
    }
    let mustache_main = await readFile(import.meta.resolve('./templates/main.mustache').slice(8), { encoding: 'utf-8' });
    let mustache_types = await readFile(import.meta.resolve('./templates/types.mustache').slice(8), { encoding: 'utf-8' });
    let mustache_collection = await readFile(import.meta.resolve('./templates/collection.mustache').slice(8), { encoding: 'utf-8' });
    let mustache_package = await readFile(import.meta.resolve('./templates/package.json.mustache').slice(8), { encoding: 'utf-8' });
    let builder_leaves = [];
    let queue = [api_builder];
    while (queue.length > 0) {
        let builder = queue.shift();
        let children = Object.values(builder.children);
        if (children.length > 0) {
            queue.push(...children);
        }
        else {
            builder_leaves.push(builder);
        }
        builder.mustache_context.child_collection_id_types = `"${children.map(ele => ele.mustache_context.collection_id).join('" | "')}"`;
        builder.mustache_context.child_collections = children.map(ele => {
            return {
                collection_id: ele.mustache_context.collection_id,
                built_collection: uppercase(ele.mustache_context.collection_id),
                built_collection_path: `./${uppercase(ele.mustache_context.collection_id)}.js`
            };
        });
    }
    let original_escape = mustache.escape;
    mustache.escape = (text) => text;
    let rendered_index = mustache.render(mustache_main, api_builder.mustache_context);
    let rendered_collection_manipulators = [];
    queue = Object.values(api_builder.children);
    let added = new Set(Object.values(api_builder.children));
    while (queue.length > 0) {
        let builder = queue.shift();
        builder.mustache_context.my_built_collection = uppercase(builder.mustache_context.collection_id);
        builder.mustache_context.my_built_collection_path = `./${uppercase(builder.mustache_context.collection_id)}`;
        builder.mustache_context.types = mustache.render(mustache_types, builder.mustache_context);
        builder.mustache_context.has_subcollections = builder.mustache_context.child_collections.length > 0;
        rendered_collection_manipulators.push({ builder: builder, text: mustache.render(mustache_collection, builder.mustache_context) });
        queue.push(...Object.values(builder.children).filter(ele => !added.has(ele)));
        for (let child of Object.values(builder.children)) {
            added.add(child);
        }
    }
    let rendered_package_json = mustache.render(mustache_package, {
        server_name: service_name
    });
    mustache.escape = original_escape;
    await writeFile([output_path, 'src', './index.ts'].join('/'), rendered_index);
    for (let manipulator of rendered_collection_manipulators) {
        await writeFile([output_path, 'src', manipulator.builder.mustache_context.my_built_collection_path + '.ts'].join('/'), manipulator.text);
    }
    await writeFile([output_path, './package.json'].join('/'), rendered_package_json);
}
export function get_type_name(collection_id, suffix) {
    return suffix ? `${collection_id}_${suffix}`.replace(/[^(a-zA-Z0-9\_)]/g, '_') : collection_id.replace(/[^(a-zA-Z0-9\_)]/g, '_');
}
export function uppercase(str) {
    let upper_on = true;
    let joinable = [];
    for (let char of str) {
        if (char === '_') {
            upper_on = true;
            joinable.push(char);
            continue;
        }
        if (upper_on) {
            upper_on = false;
            joinable.push(char.toUpperCase());
        }
        else {
            joinable.push(char);
        }
    }
    return joinable.join('');
}
function get_builder(root, parent_collection_ids, collection, mustache_context) {
    let builder = root;
    let collection_ids = parent_collection_ids.slice();
    while (collection_ids.length > 0) {
        let collection_id = collection_ids.shift();
        if (!builder.children[collection_id]) {
            builder.children[collection_id] = {
                children: {},
                parent: builder,
            };
        }
        builder = builder.children[collection_id];
    }
    if (!builder.children[collection.collection_id]) {
        builder.children[collection.collection_id] = {
            children: {},
            parent: builder,
        };
    }
    builder = builder.children[collection.collection_id];
    if (!builder.collection) {
        builder.collection = collection;
        builder.mustache_context = mustache_context;
    }
    return builder;
}
//# sourceMappingURL=generate_client_library.js.map