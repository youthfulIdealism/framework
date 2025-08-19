
import assert from "assert";

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { openAPI_from_collection } from '../dist/utils/openapi_from_zod.js';
import { F_Collection } from '../dist/f_collection.js';
import { F_Collection_Registry } from '../dist/F_Collection_Registry.js'
import { F_SM_Open_Access } from '../dist/F_Security_Models/F_SM_Open_Access.js'

import { object, z, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'
import { OpenApiBuilder } from "openapi3-ts/oas31";
import { F_Security_Model } from "../dist/F_Security_Models/F_Security_Model.js";

function assert_deep_equal_ignore_array_order(q, w, path_so_far = ''){
    if(typeof q !== typeof w){ throw new Error(`type of ${q} is not a ${w} at ${path_so_far}`); }
    if((Array.isArray(q) && !Array.isArray(w)) || (!Array.isArray(q) && Array.isArray(w))){ throw new Error(`type of ${q} is not a ${w} at ${path_so_far}`); }
    if(Array.isArray(q)){
        if(q.length !== w.length){ throw new Error(`at ${path_so_far}, the first entry has ${q.length} elements and the second has ${w.length} elements.`);}
        q.sort();
        w.sort();
        for(let e = 0; e < q.length; e++){
            assert_deep_equal_ignore_array_order(q[e], w[e], `${path_so_far}.n`)
        }
        return;
    }
    if((q === null && w !== null) || (q !== null && w === null)) { throw new Error(`type of ${q} is not a ${w} at ${path_so_far}`); }
    if(typeof q === 'object'){
        if(Object.keys(q).length !== Object.keys(w).length) { throw new Error(`keys ${Object.keys(q)} are not the same as keys ${Object.keys(w)} at ${path_so_far}`); }
        for(let key of Object.keys(q)){
            assert_deep_equal_ignore_array_order(q[key], w[key], `${path_so_far}.${key}`);
        }
        return;
    }
    if(!q === w){throw new Error(`${q} is not ${w} at ${path_so_far}`); }
}


describe.only('OpenAPI Basic Functionality', function () {
    // before any tests run, set up the server and the db connection
    before(async function() {
    })

    after(async function (){
    });

    beforeEach(async function(){
    })

    function get_builder(){
        let open_api_builder = new OpenApiBuilder({
            openapi: '3.1.0',
            info: {
                title: 'title',
                description: 'description',
                version: '0.0.0'
            }
        });

        open_api_builder.addServer({
            url: '/api',
            description: 'description'
        });

        return open_api_builder;
    }

    function get_from_openapi_stub(paths){
        return {
            "openapi": "3.1.0",
            "info": {
                "title": "title",
                "description": "description",
                "version": "0.0.0"
            },
            "servers": [
                {
                    "url": "/api",
                    "description": "description"
                }
            ],
            "paths": paths
        };
    }

    function get_path_parameters(path: string){
        return Array.from(path.matchAll(/{(.*?)}/g)).map(ele => ele [1]).map(ele => {
            return {
                in: 'path',
                name: ele,
                schema: {
                    type: 'string'
                },
                required: true,
            }
        });
    }

    function get_responses_document(path_parameters, schema_as_openapi, ) {
        return {
            get: {
                parameters: path_parameters,
                responses: {
                    '200': get_success_response(schema_as_openapi),
                    ...get_error_responses()
                }
                
            },
            put: {
                parameters: path_parameters,
                responses: {
                    '200': get_success_response(schema_as_openapi),
                    ...get_error_responses()
                }
            },
            delete: {
                parameters: path_parameters,
                responses: {
                    '200': get_success_response(schema_as_openapi),
                    ...get_error_responses()
                }
            }
        }
    }

    function get_responses_collection(path_parameters, schema_as_openapi, query_parameters) {
        return {
            get: {
                parameters: [...path_parameters, ...query_parameters,],
                responses: {
                    '200': get_success_response(schema_as_openapi),
                    ...get_error_responses()
                }
            },
            post: {
                parameters: path_parameters,
                responses: {
                    '200': get_success_response(schema_as_openapi),
                    ...get_error_responses()
                }
            },
        }
    }

    function get_error_responses(){
        return {
            "403": {
                "description": "error",
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "properties": {
                                "error": {
                                    "type": "string"
                                }
                            }
                        }
                    }
                }
            },
            "500": {
                "description": "error",
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "properties": {
                                "error": {
                                    "type": "string"
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    function get_success_response(schema){
        return {
            description: 'success',
            content: {
                'application/json': {
                    schema: {
                        "type": "object",
                        properties: {
                            data: schema
                        }
                    }
                }
            }
        }
    }

    function get_query_basics(){
        return [
            {
                in: 'query',
                name: 'limit',
                schema: { type: 'string' }
            },
            {
                in: 'query',
                name: 'cursor',
                schema: { type: 'string' }
            },
            {
                in: 'query',
                name: 'sort',
                schema: { type: 'string' }
            },
            {
                in: 'query',
                name: 'sort_order',
                schema: { type: 'string' }
            },
        ]
    }

    function get_query_variants_string(field_name){
        return [
            {
                in: 'query',
                name: field_name,
                schema: { type: 'string' }
            },
            {
                in: 'query',
                name: `${field_name}_gt`,
                schema: { type: 'string' }
            },
            {
                in: 'query',
                name: `${field_name}_gte`,
                schema: { type: 'string' }
            },
            {
                in: 'query',
                name: `${field_name}_lt`,
                schema: { type: 'string' }
            },
            {
                in: 'query',
                name: `${field_name}_lte`,
                schema: { type: 'string' }
            },
            {
                in: 'query',
                name: `${field_name}_in`,
                schema: { type: 'string' }
            },
        ]
    }

    it(`should render to an openAPI doc`, async function () {
        let builder = get_builder();
        let test_collection = new F_Collection('test', z.object({ _id: z_mongodb_id }));
        test_collection.add_layers([], [new F_SM_Open_Access(test_collection)])
        openAPI_from_collection(builder, '/api', test_collection);

        let built = JSON.parse(builder.getSpecAsJson());
        let manual = get_from_openapi_stub({
            "/api/test/{document_id}": get_responses_document(
                get_path_parameters("/api/test/{document_id}"),
                {
                    type: 'object',
                    properties: {
                        "_id": { type: 'string' }
                    }
                }
            ),
            "/api/test": get_responses_collection(
                get_path_parameters("/api/test"),
                {
                    type: 'object',
                    properties: {
                        "_id": { type: 'string' }
                    }
                },
                [...get_query_variants_string('_id'), ...get_query_basics()]
            ),
        })
        
        console.log(JSON.stringify(built))
        console.log(JSON.stringify(manual))
        //assert.deepEqual(built, manual)
        assert_deep_equal_ignore_array_order(built, manual);
        
    });
});
