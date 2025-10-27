
import assert from "assert";
import { rimraf, rimrafSync, native, nativeSync } from 'rimraf'

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { F_Collection } from '../dist/f_collection.js';
import { F_Collection_Registry } from '../dist/F_Collection_Registry.js'
import { F_SM_Open_Access } from '../dist/F_Security_Models/F_SM_Open_Access.js'
import { z, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'
import { generate_client_library } from '../dist/code_generation/generate_client_library.js'

import got from 'got'
import express, { Express, Request, Response, NextFunction } from 'express'
import mongoose, { mongo, Mongoose } from "mongoose";
import { Server } from "http";
import { mkdir, readFile } from "fs/promises";

const remove_whitespace = (input: string): string => input.replaceAll(/[\n\r\s]+/g, '')

describe('Client Library Generation: Basic Types', function () {

    // before any tests run, set up the server and the db connection
    before(async function() {

        // wait for a moment because otherwise stuff breaks for no reason
        await new Promise(resolve => setTimeout(resolve, 200))
    })

    after(async function (){
    });

    beforeEach(async function(){
        this.timeout(20000);
        mongoose.connection.modelNames().forEach(ele => mongoose.connection.deleteModel(ele));

        await rimraf('./test/tmp');
        await mkdir('./test/tmp');
    })

    it(`should be able to generate a plain object`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {"_id": string}`)
        )
    });

    it(`should be able to generate a plain object containing a string`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.string(),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": string
                }`)
        )
    });

    it(`should be able to generate a plain object containing a number`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.number(),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": number
                }`)
        )
    });

    it(`should be able to generate a plain object containing a boolean`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.boolean(),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": boolean
                }`)
        )
    });

    it(`should be able to generate a plain object containing a date`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.date(),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": Date
                }`)
        )
    });

    it(`should be able to generate a plain object containing an objectID`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z_mongodb_id,
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": string
                }`)
        )
    });

    it(`should be able to generate a plain object containing a nullable string`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.nullable(z.string()),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": string | null
                }`)
        )
    });

    it(`should be able to generate a plain object containing union types`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.string().or(z.number()),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": string | number
                }`)
        )
    });

    it(`should be able to generate a plain object containing union types wrapped in nullable`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.nullable(z.string().or(z.number())),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": string | number | null
                }`)
        )
    });

    it(`should be able to generate a plain object containing union of object types`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.object({
                sub: z.string()
            }).or(z.object({
                sub2: z.number()
            })),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": {"sub": string} | {"sub2": number}
                }`)
        )
    });

    it(`should be able to generate an enum`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.enum(["red", "green", "blue"]),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": ("red" | "green" | "blue")
                }`)
        )
    });

    it(`should be able to generate an array of enum`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.array(z.enum(["red", "green", "blue"])),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": ("red" | "green" | "blue")[]
                }`)
        )
    });

    it(`should be able to generate a plain nested object`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.object({
            }),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": {}
                }`)
        )
    });

    it(`should be able to generate a plain nested with basic fields`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.object({
                field_string: z.string(),
                field_number: z.number(),
                field_boolean: z.boolean(),
                field_date: z.date(),
                test_2: z.object({
                    field_id: z_mongodb_id,
                })
            }),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": {
                        "field_string": string
                        "field_number": number
                        "field_boolean": boolean
                        "field_date": Date
                        "test_2": {
                            "field_id": string
                        }
                    }
                }`)
        )
    });

    it(`should be able to generate arrays of primitive fields`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            field_string: z.array(z.string()),
            field_number: z.array(z.number()),
            field_boolean: z.array(z.boolean()),
            field_date: z.array(z.date()),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "field_string": string[]
                    "field_number": number[]
                    "field_boolean": boolean[]
                    "field_date": Date[]
                }`)
        )
    });

    it(`should be able to generate arrays of objects containing primitive fields`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            field_array: z.array(z.object({
                field_string: z.array(z.string()),
                field_number: z.array(z.number()),
                field_boolean: z.array(z.boolean()),
                field_date: z.array(z.date()),
            })),
            
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                "_id": string
                "field_array": {
                        "field_string": string[]
                        "field_number": number[]
                        "field_boolean": boolean[]
                        "field_date": Date[]
                    }[]
                }`)
        )
    });

    it(`should be able to generate nested arrays`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            field_array: z.array(
                z.array(z.object({
                    field_string: z.array(z.string()),
                    field_number: z.array(z.number()),
                    field_boolean: z.array(z.boolean()),
                    field_date: z.array(z.date()),
                })
            )),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                "_id": string
                "field_array": {
                        "field_string": string[]
                        "field_number": number[]
                        "field_boolean": boolean[]
                        "field_date": Date[]
                    }[][]
                }`)
        )
    });

    it(`should be able to generate a plain object containing a primitive with a default`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.string().default('ezikiel snograss'),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test"?: string
                }`)
        )
    });

    it(`should be able to generate a plain object containing an optional primitive`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.string().optional(),
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test"?: string
                }`)
        )
    });

    it(`should be able to generate a plain object containing a record`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.record(z.string(), z.string())
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": {[key: string]: string}
                }`)
        )
    });


    it(`should be able to generate a plain object containing an object record`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.record(z.string(), z.object({
                test_2: z.string()
            }))
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": {[key: string]: { "test_2": string }}
                }`)
        )
    });

    it(`should be able to generate a plain object containing an array record`, async function () {
        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: z.record(z.string(), z.array(z.string()))
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": {[key: string]: string[]}
                }`)
        )
    });

    it(`should be able to generate a recursive object`, async function () {
        const recursive = z.object({
            name: z.string(),
            get child() {
                return recursive;
            }
        }).meta({id: 'test_recursive_object'})

        const validate_test_collection = z.object({
            _id: z_mongodb_id,
            test: recursive
        });

        let test_collection = new F_Collection('test_collection', 'test_collection', validate_test_collection);

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/src/types/test_collection.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection = {
                    "_id": string
                    "test": type_test_recursive_object
                }
                type type_test_recursive_object = {
                    "name": string
                    "child": type_test_recursive_object
                }`)
        )
    });
});
