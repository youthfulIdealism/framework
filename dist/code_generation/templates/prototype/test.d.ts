import { REPLACE } from './REPLACE.js';
import { REPLACE_query } from './REPLACE_query.js';
import { REPLACE_put } from './REPLACE_put.js';
import { REPLACE_post } from './REPLACE_post.js';
export declare function get(document_id: string): Promise<REPLACE>;
export declare function query(query: REPLACE_query): Promise<REPLACE[]>;
export declare function put(document_id: string, update: REPLACE_put): Promise<REPLACE>;
export declare function post(document: REPLACE_post): Promise<REPLACE>;
export declare function remove(document_id: string): Promise<REPLACE>;
