
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

describe.only('Client Library Generation', function () {

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
    });
});
