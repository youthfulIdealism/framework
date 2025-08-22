import { readFile, writeFile } from "node:fs/promises";
import { type_from_zod } from "./utils/type_from_zod.js";
import mustache from 'mustache';
export async function generate_client_library(path, collection_registry) {
    let api_builder = {
        mustache_context: {},
        children: {}
    };
    for (let col of Object.values(collection_registry.collections)) {
        let collection = col;
        let mustache_context = {
            collection_id: collection.collection_id,
            type_return: `${get_type_name(collection.collection_id)}`,
            path_type_return: `types_${get_type_name(collection.collection_id)}.ts`,
            type_query: `${get_type_name(collection.collection_id)}_query`,
            path_type_query: `types_${get_type_name(collection.collection_id)}_query.ts`,
            type_put: `${get_type_name(collection.collection_id)}_put`,
            path_type_put: `types_${get_type_name(collection.collection_id)}_put.ts`,
            type_post: `${get_type_name(collection.collection_id)}_post`,
            path_type_post: `types_${get_type_name(collection.collection_id)}_post.ts`,
        };
        let collection_type_definition_builder = [];
        let collection_type_main = type_from_zod(collection.schema, 0);
        collection_type_definition_builder.push(`export type ${mustache_context.type_return} = ${collection_type_main[0]}`, ...collection_type_main.slice(1));
        let collection_query_type_definition_builder = [];
        let collection_type_query = type_from_zod(collection.query_schema, 0);
        collection_query_type_definition_builder.push(`export type ${mustache_context.type_query} = ${collection_type_query[0]}`, ...collection_type_query.slice(1));
        let collection_put_type_definition_builder = [];
        let collection_type_put = type_from_zod(collection.put_schema, 0);
        collection_put_type_definition_builder.push(`export type ${mustache_context.type_put} = ${collection_type_put[0]}`, ...collection_type_put.slice(1));
        let collection_post_type_definition_builder = [];
        let collection_type_post = type_from_zod(collection.post_schema, 0);
        collection_post_type_definition_builder.push(`export type ${mustache_context.type_post} = ${collection_type_post[0]}`, ...collection_type_post.slice(1));
        await writeFile([path, mustache_context.path_type_return].join('/'), collection_type_definition_builder.join('\n'));
        await writeFile([path, mustache_context.path_type_query].join('/'), collection_query_type_definition_builder.join('\n'));
        await writeFile([path, mustache_context.path_type_put].join('/'), collection_query_type_definition_builder.join('\n'));
        await writeFile([path, mustache_context.path_type_post].join('/'), collection_query_type_definition_builder.join('\n'));
        for (let access_layer of collection.access_layers) {
            let builder = get_builder(api_builder, access_layer.layers, collection, mustache_context);
        }
    }
    console.log(import.meta.resolve('./src/code_generation/templates/main.mustache'));
    let mustache_main = await readFile(import.meta.resolve('./src/code_generation/templates/main.mustache'), { encoding: 'utf-8' });
    let mustache_types = await readFile(import.meta.resolve('./src/code_generation/templates/types.mustache'), { encoding: 'utf-8' });
    let mustache_collection = await readFile(import.meta.resolve('./src/code_generation/templates/types.mustache'), { encoding: 'utf-8' });
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
                built_collection: 'PLACHOLDER'
            };
        });
    }
    await writeFile([path, './index.ts'].join('/'), mustache.render(mustache_main, api_builder.mustache_context));
}
export function get_type_name(collection_id, suffix) {
    return suffix ? `${collection_id}_${suffix}`.replace(/[^(a-zA-Z0-9\_)]/g, '_') : collection_id.replace(/[^(a-zA-Z0-9\_)]/g, '_');
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