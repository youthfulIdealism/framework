import { F_Collection } from "../F_Collection.js";
import { F_Collection_Registry } from "../F_Collection_Registry.js";
import { writeFile } from "node:fs/promises";
import { type_from_zod } from "./utils/type_from_zod.js";



export async function generate_client_library<Collections>(path: string, collection_registry: F_Collection_Registry<Collections>) {


    // build the typescript types
    for(let col of Object.values(collection_registry.collections)){
        let collection = col as F_Collection<string, any>;
        //console.log(collection.collection_id)
        //console.log(`START FILE types_${collection.collection_id.replace(/[^(a-zA-Z0-9\-\_)]/g, '-')}.ts`)

        let collection_type_definition_builder = [] as string[];
        let collection_type_main = type_from_zod(collection.schema, 0);
        collection_type_definition_builder.push(`export type ${get_type_name(collection.collection_id)} = ${collection_type_main[0]}`, ...collection_type_main.slice(1));

        let collection_query_type_definition_builder = [] as string[];
        let collection_type_query = type_from_zod(collection.query_schema, 0);
        collection_query_type_definition_builder.push(`export type ${get_type_name(collection.collection_id)}_query = ${collection_type_query[0]}`, ...collection_type_query.slice(1));

        //console.log(collection_type_definition_builder.join('\n'));
        await writeFile([path, `types_${get_type_name(collection.collection_id)}.ts`].join('/'), collection_type_definition_builder.join('\n'))
        await writeFile([path, `types_${get_type_name(collection.collection_id)}_query.ts`].join('/'), collection_query_type_definition_builder.join('\n'))
        
    }



}

export function get_type_name(collection_id: string, suffix?: string): string {
    return suffix ? `${collection_id}_${suffix}`.replace(/[^(a-zA-Z0-9\_)]/g, '_') : collection_id.replace(/[^(a-zA-Z0-9\_)]/g, '_');
}



