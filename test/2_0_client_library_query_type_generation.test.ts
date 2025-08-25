
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

/*mongoose.connection.on('connected', () => console.log('connected'));
mongoose.connection.on('open', () => console.log('open'));
mongoose.connection.on('disconnected', () => console.log('disconnected'));
mongoose.connection.on('reconnected', () => console.log('reconnected'));
mongoose.connection.on('disconnecting', () => console.log('disconnecting'));
mongoose.connection.on('close', () => console.log('close'));*/

const remove_whitespace = (input: string): string => input.replaceAll(/[\n\r\s]+/g, '')

describe('Client Library Generation: Query Types', function () {

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

    it(`should be able to generate a query for a plain object`, async function () {
        const validate_test_collection = z.object({});

        let test_collection = new F_Collection('test_collection', validate_test_collection, 'client');

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/types_test_collection_query.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection_query = {
                    "limit"?: number
                    "cursor"?: string
                    "sort_order"?: ("ascending" | "descending")
                    "sort"?: ("")
                }`)
        )
    });

    it(`should be able to generate a plain object containing a string`, async function () {
        const validate_test_collection = z.object({
            test: z.string(),
        });

        let test_collection = new F_Collection('test_collection', validate_test_collection, 'client');

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/types_test_collection_query.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection_query = {
                    "limit"?: number
                    "cursor"?: string
                    "sort_order"?: ("ascending" | "descending")
                    "test"?: string
                    "test_gt"?: string
                    "test_lt"?: string
                    "test_in"?: string[]
                    "sort"?: ("test")
                }`)
        )
    });

    it(`should be able to generate a plain object containing a number`, async function () {
        const validate_test_collection = z.object({
            test: z.number(),
        });

        let test_collection = new F_Collection('test_collection', validate_test_collection, 'client');

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/types_test_collection_query.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection_query = {
                    "limit"?: number
                    "cursor"?: string
                    "sort_order"?: ("ascending" | "descending")
                    "test"?: number
                    "test_gt"?: number
                    "test_gte"?: number
                    "test_lt"?: number
                    "test_lte"?: number
                    "sort"?: ("test")
                }`)
        )
    });

    it(`should be able to generate a plain object containing a boolean`, async function () {
        const validate_test_collection = z.object({
            test: z.boolean(),
        });

        let test_collection = new F_Collection('test_collection', validate_test_collection, 'client');

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/types_test_collection_query.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection_query = {
                    "limit"?: number
                    "cursor"?: string
                    "sort_order"?: ("ascending" | "descending")
                    "test"?: boolean
                    "sort"?: ("test")
                }`)
        )
    });

    it(`should be able to generate a plain object containing a date`, async function () {
        const validate_test_collection = z.object({
            test: z.date(),
        });

        let test_collection = new F_Collection('test_collection', validate_test_collection, 'client');

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/types_test_collection_query.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection_query = {
                    "limit"?: number
                    "cursor"?: string
                    "sort_order"?: ("ascending" | "descending")
                    "test"?: Date
                    "test_gt"?: Date
                    "test_lt"?: Date
                    "sort"?: ("test")
                }`)
        )
    });

    it(`should be able to generate a plain object containing an objectID`, async function () {
        const validate_test_collection = z.object({
            test: z_mongodb_id,
        });

        let test_collection = new F_Collection('test_collection', validate_test_collection, 'client');

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/types_test_collection_query.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection_query = {
                    "limit"?: number
                    "cursor"?: string
                    "sort_order"?: ("ascending" | "descending")
                    "test"?: string
                    "test_gt"?: string
                    "test_lt"?: string
                    "test_in"?: string[]
                    "sort"?: ("test")
                }`)
        )
    });

    it(`should be able to generate an enum`, async function () {
        const validate_test_collection = z.object({
            test: z.enum(["red", "green", "blue"]),
        });

        let test_collection = new F_Collection('test_collection', validate_test_collection, 'client');

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/types_test_collection_query.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection_query = {
                    "limit"?: number
                    "cursor"?: string
                    "sort_order"?: ("ascending" | "descending")
                    "test"?: ("red" | "green" | "blue")
                    "test_in"?: ("red" | "green" | "blue")[]
                    "sort"?: ("test")
                }`)
        )
    });



    it(`should be able to generate a plain nested object`, async function () {
        const validate_test_collection = z.object({
            test: z.object({
            }),
        });

        let test_collection = new F_Collection('test_collection', validate_test_collection, 'client');

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/types_test_collection_query.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection_query = {
                    "limit"?: number
                    "cursor"?: string
                    "sort_order"?: ("ascending" | "descending")
                    "sort"?: ("")
                }`)
        )
    });

    it(`should be able to generate a plain nested with basic fields`, async function () {
        const validate_test_collection = z.object({
            test: z.object({
                field_string: z.string(),
                field_number: z.number(),
                field_boolean: z.boolean(),
                field_date: z.date(),
                test_2: z.object({
                    field_doublenested: z.boolean(),
                })
            }),
        });

        let test_collection = new F_Collection('test_collection', validate_test_collection, 'client');

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/types_test_collection_query.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection_query = {
                    "limit"?: number
                    "cursor"?: string
                    "sort_order"?: ("ascending" | "descending")

                    "test.field_string"?: string
                    "test.field_string_gt"?: string
                    "test.field_string_lt"?: string
                    "test.field_string_in"?: string[]

                    "test.field_number"?: number
                    "test.field_number_gt"?: number
                    "test.field_number_gte"?: number
                    "test.field_number_lt"?: number
                    "test.field_number_lte"?: number

                    "test.field_boolean"?: boolean

                    "test.field_date"?: Date
                    "test.field_date_gt"?: Date
                    "test.field_date_lt"?: Date

                    "test.test_2.field_doublenested"?: boolean
                    "sort"?: ("test.field_string" | "test.field_number" | "test.field_boolean" | "test.field_date" | "test.test_2.field_doublenested")
                }`)
        )
    });

    it(`should be able to generate arrays of primitive fields`, async function () {
        const validate_test_collection = z.object({
            field_string: z.array(z.string()),
            field_number: z.array(z.number()),
            field_boolean: z.array(z.boolean()),
        });

        let test_collection = new F_Collection('test_collection', validate_test_collection, 'client');

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/types_test_collection_query.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection_query = {
                    "limit"?: number
                    "cursor"?: string
                    "sort_order"?: ("ascending" | "descending")
                    "field_string"?: string
                    "field_number"?: number
                    "field_boolean"?: boolean
                    "sort"?: ("field_string" | "field_number" | "field_boolean")
                }`)
        )
    });

    it(`should be able to generate a plain object containing a primitive with a default`, async function () {
        const validate_test_collection = z.object({
            test: z.boolean().default(true),
        });

        let test_collection = new F_Collection('test_collection', validate_test_collection, 'client');

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry.register(test_collection);

        await generate_client_library('./test/tmp', registry);

        assert.equal(
            remove_whitespace(await readFile('./test/tmp/types_test_collection_query.ts', { encoding: 'utf-8' })),
            remove_whitespace(`export type test_collection_query = {
                    "limit"?: number
                    "cursor"?: string
                    "sort_order"?: ("ascending" | "descending")
                    "test"?: boolean
                    "sort"?: ("test")
                }`)
        )
    });
});
