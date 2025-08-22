import ky from 'ky';

import { REPLACE } from './REPLACE.js';
import { REPLACE_query } from './REPLACE_query.js';
import { REPLACE_put } from './REPLACE_put.js';
import { REPLACE_post } from './REPLACE_post.js';

const api_root = "API_ROOT";


// for one collection?

export async function get(get_auth: () => any, document_id: string): Promise<REPLACE>{
    return ky.get() as REPLACE;
}

export async function query(get_auth: () => any,query: REPLACE_query): Promise<REPLACE[]>{
    return {} as REPLACE[];
}

export async function put(get_auth: () => any,document_id: string, update: REPLACE_put): Promise<REPLACE>{
    return {} as REPLACE;
}

export async function post(get_auth: () => any,document: REPLACE_post): Promise<REPLACE>{
    return {} as REPLACE;
}

export async function remove(get_auth: () => any,document_id: string): Promise<REPLACE>{
    return {} as REPLACE;
}