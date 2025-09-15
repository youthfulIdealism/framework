
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

import { exec, spawn } from "child_process";

/*mongoose.connection.on('connected', () => console.log('connected'));
mongoose.connection.on('open', () => console.log('open'));
mongoose.connection.on('disconnected', () => console.log('disconnected'));
mongoose.connection.on('reconnected', () => console.log('reconnected'));
mongoose.connection.on('disconnecting', () => console.log('disconnecting'));
mongoose.connection.on('close', () => console.log('close'));*/

const remove_whitespace = (input: string): string => input.replaceAll(/[\n\r\s]+/g, '')

describe('Client Library Generation: Library Generation', function () {
    const port = 4601;
    let express_app: Express;
    let server: Server;
    let db_connection: Mongoose;

    const validate_institution = z.object({
        _id: z_mongodb_id,
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
        project_number: z.number(),
    });

    const validate_brief_news_category = z.object({
        _id: z_mongodb_id,
        name: z.string(),
        slug: z.string(),
        institution_id: z_mongodb_id,
        client_id: z_mongodb_id,
    });

    let collection_institution: F_Collection<'institution', typeof validate_institution>;
    let collection_client: F_Collection<'client', typeof validate_client>;
    let collection_project: F_Collection<'project', typeof validate_project>;
    let collection_brief_news_category: F_Collection<'brief_news_category', typeof validate_brief_news_category>;

    let registry: F_Collection_Registry;

    // before any tests run, set up the server and the db connection
    before(async function() {
        this.timeout(10 * 1000)

        express_app = express();
        express_app.use(express.json());
        db_connection = await mongoose.connect('mongodb://127.0.0.1:27017/');
        
        await rimraf('./test/tmp');
        await mkdir('./test/tmp');

        collection_institution = new F_Collection('institution', 'institutions', validate_institution);
        collection_institution.add_layers([], [new F_SM_Open_Access(collection_institution)])

        collection_client = new F_Collection('client', 'clients', validate_client);
        collection_client.add_layers(['institution'], [new F_SM_Open_Access(collection_client)])

        collection_project = new F_Collection('project', 'projects', validate_project);
        collection_project.add_layers(['institution', 'client'], [new F_SM_Open_Access(collection_project)])

        collection_brief_news_category = new F_Collection('brief_news_category', 'brief_news_categories', validate_brief_news_category);
        collection_brief_news_category.add_layers(['institution', 'client'], [new F_SM_Open_Access(collection_brief_news_category)])

        let proto_registry = new F_Collection_Registry();
        registry = proto_registry
            .register(collection_institution)
            .register(collection_client)
            .register(collection_project)
            .register(collection_brief_news_category)
        registry.compile(express_app, '/api');

        server = express_app.listen(port);

        await generate_client_library('./test/tmp', registry);

        await new Promise((resolve, rej) => {
            exec('npm install', { cwd: './test/tmp/' }, (err, stdout, stderr) => {
                if (err) {
                    // node couldn't execute the command
                    console.error(err)
                    throw err;
                }

                console.error(stderr)
                resolve('');
            });
        })

        await new Promise((resolve, rej) => {
            exec('npm run-script build', { cwd: './test/tmp/' }, (err, stdout, stderr) => {
                if (err) {
                    // node couldn't execute the command
                    console.error(err)
                    throw err;
                }

                console.error(stderr)
                resolve('');
            });
        })

        // wait for a moment because otherwise stuff breaks for no reason
        await new Promise(resolve => setTimeout(resolve, 200))
    })

    after(async function (){
        await server.close();
        mongoose.connection.modelNames().forEach(ele => mongoose.connection.deleteModel(ele));
        db_connection.modelNames().forEach(ele => db_connection.deleteModel(ele));
        await db_connection.disconnect()
    });

    beforeEach(async function(){
        for(let collection of Object.values(registry.collections)){
            //@ts-ignore
            await collection.mongoose_model.collection.drop();
        }
    })

    async function generate_test_setup(){
        let institution = await collection_institution.mongoose_model.create({
            name: 'test institution'
        });

        let client = await collection_client.mongoose_model.create({
            name: 'test client',
            institution_id: institution._id,
        });

        let test_projects: z.infer<typeof collection_project.validator>[] = [];
        for(let q = 0; q < 10; q++){
            test_projects.push(await collection_project.mongoose_model.create({
                name: 'test project',
                institution_id: institution._id,
                client_id: client._id,
                project_number: 1
            }))
        }

        return { institution,  client, test_projects}
    }

    it(`should be able to service a basic GET request`, async function () {
        let { api } = await import("./tmp/dist/index.js");
        let { institution } = await generate_test_setup();
        
        let result = await api(`http://localhost:${port}/api`, async () => "todd").collection('institution').document(institution._id).get();
        assert.deepEqual(
            JSON.parse(JSON.stringify(institution)),
            result
        )
    });

    it(`should be able to service a basic query`, async function () {
        let { api } = await import("./tmp/dist/index.js");
        let { institution } = await generate_test_setup();
        
        let result = await api(`http://localhost:${port}/api`, async () => "todd").collection('institution').query({});
        assert.deepEqual(
            [JSON.parse(JSON.stringify(institution))],
            result
        )
    });

    it(`should be able to service a basic POST`, async function () {
        let { api } = await import("./tmp/dist/index.js");
        let { } = await generate_test_setup();
        
        let result = await api(`http://localhost:${port}/api`, async () => "todd").collection('institution').post({
            name: 'new institution',
        });
        assert.deepEqual(
            JSON.parse(JSON.stringify(await collection_institution.mongoose_model.findById(result._id))),
            JSON.parse(JSON.stringify(result)),
        )
    });

    it(`should be able to service a basic PUT`, async function () {
        let { api } = await import("./tmp/dist/index.js");
        let { institution } = await generate_test_setup();
        
        let result = await api(`http://localhost:${port}/api`, async () => "todd").collection('institution').document(institution._id).put({
            name: 'redo institution name',
        });
        assert.deepEqual(
            JSON.parse(JSON.stringify(await collection_institution.mongoose_model.findById(institution._id))),
            JSON.parse(JSON.stringify(result)),
        )
    });

    it(`should be able to service a basic DELETE`, async function () {
        let { api } = await import("./tmp/dist/index.js");
        let { institution } = await generate_test_setup();
        
        let result = await api(`http://localhost:${port}/api`, async () => "todd").collection('institution').document(institution._id).remove();
        assert.deepEqual(
            await collection_institution.mongoose_model.findById(institution._id),
            undefined,
        )
    });

    it(`should be able to service a basic query on nested collections`, async function () {
        let { api } = await import("./tmp/dist/index.js");
        let { institution, client, test_projects } = await generate_test_setup();
        
        let result;
        try {
            result = await api(`http://localhost:${port}/api`, async () => "todd")
                .collection('institution')
                .document(institution._id)
                .collection('client')
                .document(client._id)
                .collection("project")
                .query({
                    project_number_gt: 5
                });
        } catch(err) {
            console.error(await err.response.json())
        }

        assert.deepEqual(
            JSON.parse(JSON.stringify(test_projects.filter(ele => ele.project_number > 5))),
            result
        )
    });
    
});
