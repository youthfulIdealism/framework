
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

import { api } from "./tmp/dist/index.js"

/*mongoose.connection.on('connected', () => console.log('connected'));
mongoose.connection.on('open', () => console.log('open'));
mongoose.connection.on('disconnected', () => console.log('disconnected'));
mongoose.connection.on('reconnected', () => console.log('reconnected'));
mongoose.connection.on('disconnecting', () => console.log('disconnecting'));
mongoose.connection.on('close', () => console.log('close'));*/

const remove_whitespace = (input: string): string => input.replaceAll(/[\n\r\s]+/g, '')

describe.only('Client Library Generation: Library Generation', function () {

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
        const validate_institution = z.object({
            _id:z_mongodb_id,
            name: z.string(),
        });

        const validate_client = z.object({
            _id: z_mongodb_id,
            name: z.string(),
            institution_id: z_mongodb_id,
        });

        const validate_project = z.object({
            _id: z_mongodb_id,
            name: z.string(),
            institution_id: z_mongodb_id,
            client_id: z_mongodb_id,
        });

        const validate_brief_news_category = z.object({
            _id: z_mongodb_id,
            name: z.string(),
            slug: z.string(),
            institution_id: z_mongodb_id,
            client_id: z_mongodb_id,
        });

        let collection_institution = new F_Collection('institution', validate_institution, 'client');
        collection_institution.add_layers([], [])

        let collection_client = new F_Collection('client', validate_client, 'client');
        collection_client.add_layers(['institution'], [])

        let collection_project = new F_Collection('project', validate_project, 'client');
        collection_project.add_layers(['institution', 'client'], [])

        let collection_brief_news_category = new F_Collection('brief_news_category', validate_brief_news_category, 'client');
        collection_brief_news_category.add_layers(['institution', 'client'], [])

        let proto_registry = new F_Collection_Registry();
        let registry = proto_registry
            .register(collection_institution)
            .register(collection_client)
            .register(collection_project)
            .register(collection_brief_news_category)

        await generate_client_library('./test/tmp', registry);
    });
});
