import { F_Collection } from "../F_Collection.js";
import { F_Collection_Registry } from "../F_Collection_Registry.js";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { type_from_zod } from "./utils/type_from_zod.js";
import mustache from 'mustache'
import { existsSync } from "node:fs";
import { pretty_print } from "../utils/pretty_print_zod.js";
import { fileURLToPath } from 'url';
import { normalize, join } from 'path'


type api_builder = {
    collection?: F_Collection<string, any>,
    mustache_context?: any,
    children: {
        [key: string]: api_builder
    },
    parent?: api_builder
}

function build_path(...args: string[]){
    return normalize(join(...args));
}


export async function generate_client_library<Collections>(output_path: string, collection_registry: F_Collection_Registry<Collections>, service_name = 'default-service') {
    let api_builder: api_builder = {
        mustache_context: {},
        children: {},
    };

    if(!existsSync(build_path(output_path, 'src'))){ await mkdir(build_path(output_path, 'src')); }
    if(!existsSync(build_path(output_path, 'dist'))){ await mkdir(build_path(output_path, 'dist')); }
    if(!existsSync(build_path(output_path, 'src', 'types'))){ await mkdir(build_path(output_path, 'src', 'types')); }
    if(!existsSync(build_path(output_path, 'src', 'utils'))){ await mkdir(build_path(output_path, 'src', 'utils')); }
    await writeFile(build_path(output_path, 'src', 'utils', 'utils.ts'), await readFile(fileURLToPath(import.meta.resolve('./templates/utils.ts.mustache')), { encoding: 'utf-8' }));
    await writeFile(build_path(output_path, 'tsconfig.json'), await readFile(fileURLToPath(import.meta.resolve('./templates/tsconfig.json.mustache')), { encoding: 'utf-8' }));
    await writeFile(build_path(output_path, '.gitignore'), await readFile(fileURLToPath(import.meta.resolve('./templates/.gitignore.mustache')), { encoding: 'utf-8' }));
        

    // build the typescript types
    for(let col of Object.values(collection_registry.collections)){
        let collection = col as F_Collection<string, any>;

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

            array_children: [] as any[],
            has_array_children: false,
        }

        for(let [array_child_key, array_child_validator] of collection.array_children_map.entries()){
            let array_child_put_type = type_from_zod(array_child_validator);
            let array_child_post_type = type_from_zod(collection.array_children_post_map.get(array_child_key));
            let type_name = get_array_child_type_name(mustache_context.type_return, array_child_key);
            let type_put_name = `${type_name}_put`
            let type_post_name = `${type_name}_post`

            let array_child_mustache_context = {
                array_name: array_child_key,
                type_array_child_put: type_put_name,
                array_type_put_definition: `export type ${type_put_name} = ${array_child_put_type[0]}\n${array_child_put_type.slice(1).join('\n')}`,
                type_array_child_post: type_post_name,
                array_type_post_definition: `export type ${type_post_name} = ${array_child_post_type[0]}\n${array_child_post_type.slice(1).join('\n')}`,
            };
            mustache_context.array_children.push(array_child_mustache_context);
            mustache_context.has_array_children = true;
        }

        let collection_type_definition_builder = [] as string[];
        let collection_type_main = type_from_zod(collection.validator);
        collection_type_definition_builder.push(`export type ${mustache_context.type_return} = ${collection_type_main[0]}`, ...collection_type_main.slice(1));

        let collection_query_type_definition_builder = [] as string[];
        let collection_type_query = type_from_zod(collection.query_validator_client);
        collection_query_type_definition_builder.push(`export type ${mustache_context.type_query} = ${collection_type_query[0]}`, ...collection_type_query.slice(1));

        let collection_put_type_definition_builder = [] as string[];
        let collection_type_put = type_from_zod(collection.put_validator);
        collection_put_type_definition_builder.push(`export type ${mustache_context.type_put} = ${collection_type_put[0]}`, ...collection_type_put.slice(1));

        let collection_post_type_definition_builder = [] as string[];
        let collection_type_post = type_from_zod(collection.post_validator);
        collection_post_type_definition_builder.push(`export type ${mustache_context.type_post} = ${collection_type_post[0]}`, ...collection_type_post.slice(1));

        await writeFile(build_path(output_path, 'src', mustache_context.path_type_return + '.ts'), collection_type_definition_builder.join('\n'));
        await writeFile(build_path(output_path, 'src', mustache_context.path_type_query + '.ts'), collection_query_type_definition_builder.join('\n'));
        await writeFile(build_path(output_path, 'src', mustache_context.path_type_put + '.ts'), collection_put_type_definition_builder.join('\n'));
        await writeFile(build_path(output_path, 'src', mustache_context.path_type_post + '.ts'), collection_post_type_definition_builder.join('\n'));

        for(let access_layer of collection.access_layers) {
            let builder = get_builder(api_builder, access_layer.layers, collection, mustache_context);
        }
    }

    let mustache_main = await readFile(fileURLToPath(import.meta.resolve('./templates/main.mustache')), { encoding: 'utf-8' });
    let mustache_types = await readFile(fileURLToPath(import.meta.resolve('./templates/types.mustache')), { encoding: 'utf-8' });
    let mustache_collection = await readFile(fileURLToPath(import.meta.resolve('./templates/collection.mustache')), { encoding: 'utf-8' });
    let mustache_package = await readFile(fileURLToPath(import.meta.resolve('./templates/package.json.mustache')), { encoding: 'utf-8' });

    let builder_leaves = [];
    let queue: api_builder[] = [api_builder];
    while(queue.length > 0){
        let builder = queue.shift();

        let children = Object.values(builder.children);
        if(children.length > 0){
            queue.push(...children);
        } else {
            builder_leaves.push(builder);
        }
        
        builder.mustache_context.child_collection_id_types = `"${children.map(ele => ele.mustache_context.collection_id).join('" | "')}"`
        builder.mustache_context.child_collections = children.map(ele => {
            return {
                collection_id: ele.mustache_context.collection_id,
                built_collection: uppercase(ele.mustache_context.collection_id),
                built_collection_path: `./${uppercase(ele.mustache_context.collection_id)}.js`
            }
        })
    }

    // save the escape function used by mustache so that if another
    // tool or portion of the tool uses mustache, we don't create
    // a difficult-to-diagnose bug. It is important not to have any
    // async calls until we have restored the original escape function.
    let original_escape = mustache.escape;
    mustache.escape = (text) => text;

    let rendered_index = mustache.render(mustache_main, api_builder.mustache_context);
    let rendered_collection_manipulators = [];

    queue = Object.values(api_builder.children)
    let added = new Set(Object.values(api_builder.children));
    while(queue.length > 0){
        let builder = queue.shift();
        builder.mustache_context.my_built_collection = uppercase(builder.mustache_context.collection_id);
        builder.mustache_context.my_built_collection_path = `./${uppercase(builder.mustache_context.collection_id)}`;
        builder.mustache_context.types = mustache.render(mustache_types, builder.mustache_context);
        builder.mustache_context.has_subcollections = builder.mustache_context.child_collections.length > 0;
        rendered_collection_manipulators.push({builder: builder, text: mustache.render(mustache_collection, builder.mustache_context)})
        queue.push(...Object.values(builder.children).filter(ele => !added.has(ele)));
        for(let child of Object.values(builder.children)){
            added.add(child);
        }
    }

    let rendered_package_json = mustache.render(mustache_package, {
        server_name: service_name
    });

    // restore the original escape function so that it the escape function
    // used by this code doesn't interfere with other vode.
    mustache.escape = original_escape;


    await writeFile([output_path, 'src', './index.ts'].join('/'), rendered_index);
    for(let manipulator of rendered_collection_manipulators) {
        await writeFile([output_path, 'src', manipulator.builder.mustache_context.my_built_collection_path as string + '.ts'].join('/'), manipulator.text);
    }
    await writeFile([output_path, './package.json'].join('/'), rendered_package_json);
}

export function get_type_name(collection_id: string, suffix?: string): string {
    return suffix ? `${collection_id}_${suffix}`.replace(/[^(a-zA-Z0-9\_)]/g, '_') : collection_id.replace(/[^(a-zA-Z0-9\_)]/g, '_');
}

export function get_array_child_type_name(collection_id: string, array_key: string): string {
    return collection_id + '_' + array_key.replace(/[^(a-zA-Z0-9\_)]/g, '_');
}

export function uppercase(str: string): string {
    let upper_on = true;
    let joinable = [];
    for(let char of str) {
        if(char === '_'){ upper_on = true; joinable.push(char); continue;}
        if(upper_on) {
            upper_on = false;
            joinable.push(char.toUpperCase())
        } else {
           joinable.push(char)
        }
    }

    return joinable.join('')
}

function get_builder(root: api_builder, parent_collection_ids: string[], collection: F_Collection<string, any>, mustache_context: any){
    let builder = root;
    let collection_ids = parent_collection_ids.slice();
    while(collection_ids.length > 0){ 
        let collection_id = collection_ids.shift();
        if(!builder.children[collection_id]){
            builder.children[collection_id] = {
                children: {},
                parent: builder,
            }
        }
        builder = builder.children[collection_id];
    }

    if(!builder.children[collection.collection_id]){
        builder.children[collection.collection_id] = {
            children: {},
            parent: builder,
        }
    }

    builder = builder.children[collection.collection_id];

    if(!builder.collection){
        builder.collection = collection;
        builder.mustache_context = mustache_context;
    }
    
    return builder;
}

