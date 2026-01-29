
import assert from "assert";

import { z_mongodb_id, z_mongodb_id_optional } from '../dist/utils/mongoose_from_zod.js';
import { F_Collection } from '../dist/f_collection.js';
import { F_Collection_Registry } from '../dist/F_Collection_Registry.js'
import { F_SM_Open_Access } from '../dist/F_Security_Models/F_SM_Open_Access.js'
import { z, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'

import got from 'got'
import express, { Express, Request, Response, NextFunction } from 'express'
import mongoose, { Mongoose } from "mongoose";
import { Server } from "http";

/*mongoose.connection.on('connected', () => console.log('connected'));
mongoose.connection.on('open', () => console.log('open'));
mongoose.connection.on('disconnected', () => console.log('disconnected'));
mongoose.connection.on('reconnected', () => console.log('reconnected'));
mongoose.connection.on('disconnecting', () => console.log('disconnecting'));
mongoose.connection.on('close', () => console.log('close'));*/

describe.only('Basic server with complex queries', function () {
    const port = 4601;
    let express_app: Express;
    let server: Server;
    let db_connection: Mongoose;

    const validate_institution = z.object({
        _id: z_mongodb_id,
        name: z.string(),
        meta: z.any().optional()
    });
    const validate_client = z.object({
        _id: z_mongodb_id,
        institution_id: z_mongodb_id,
        name: z.string(),
    });
    const validate_project = z.object({
        _id: z_mongodb_id,
        institution_id: z_mongodb_id,
        client_id: z_mongodb_id,
        name: z.string(),
    });
    const validate_list_container = z.object({
        _id: z_mongodb_id,
        container: z.object({
            list: z.array(z.object({
                _id: z_mongodb_id_optional,
                value: z.string()
            }))
        })
    });

    let institution: F_Collection<'institution', typeof validate_institution>;
    let client: F_Collection<'client', typeof validate_client>;
    let project: F_Collection<'project', typeof validate_project>;
    let list_container: F_Collection<'list_container', typeof validate_list_container>;

    let registry: F_Collection_Registry;
    

    // before any tests run, set up the server and the db connection
    before(async function() {
        this.timeout(10000)
        express_app = express();
        express_app.use(express.json());
        db_connection = await mongoose.connect('mongodb://127.0.0.1:27017/');

        // if we define these in mocha's describe() function, it runs before connecting to the database.
        // this causes the mongoose definitions to get attached to a database instance that is closed at
        // the end of the previous test, spawning a MongoNotConnectedError error.
        institution = new F_Collection('institution', 'institutions', validate_institution);
        institution.add_layers([], [new F_SM_Open_Access(institution)]);

        client = new F_Collection('client', 'clients', validate_client);
        client.add_layers([institution.collection_id], [new F_SM_Open_Access(client)]);

        project = new F_Collection('project', 'projects', validate_project);
        project.add_layers([institution.collection_id, client.collection_id], [new F_SM_Open_Access(project)]);

        list_container = new F_Collection('list_container', 'list_containers', validate_list_container);
        list_container.add_layers([], [new F_SM_Open_Access(list_container)]);

        // build registry
        let proto_registry = new F_Collection_Registry();
        registry = proto_registry.register(institution).register(client).register(project).register(list_container);
        registry.compile(express_app, '/api');

        server = express_app.listen(port);

        // wait for a moment because otherwise stuff breaks for no reason
        await new Promise(resolve => setTimeout(resolve, 200))
    })

    after(async function (){
        await server.close();
        mongoose.connection.modelNames().forEach(ele => mongoose.connection.deleteModel(ele));
        db_connection.modelNames().forEach(ele => db_connection.deleteModel(ele));

        await new Promise(resolve => setTimeout(resolve, 500))

        await db_connection.disconnect()

        await new Promise(resolve => setTimeout(resolve, 500))
    });

    beforeEach(async function(){
        for(let collection of Object.values(registry.collections)){
            //@ts-ignore
            await collection.mongoose_model.collection.drop();
        }
    })

      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    GET multiple        ///////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    it(`should be able to perform a basic GET multiple operation`, async function () {
        let test_institutions = []
        for(let q = 0; q < 5; q++){
            let test_institution = await institution.mongoose_model.create({
                name: ['spandex co',
                    'the ordinary institute',
                    'saliva branding collective',
                    'united league of billionare communitsts',
                    'geriatric co',
                    'jousing club of omaha, nebraska',
                    'dental hygenist paratrooper union',
                    'martha stewart\'s cannibal fan club',
                    'wrecking ball operator crochet club',
                    'accidental co'
                ][q]
            });
            //@ts-ignore
            test_institutions.push(test_institution);
        }

        let advanced_query = {
            $and: [{
                name: { $eq: 'spandex co'}
            }]
        }

        let results = await got.get(`http://localhost:${port}/api/institution?advanced_query=${JSON.stringify(advanced_query)}`).json();
        
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institutions.filter(ele => ele.name === 'spandex co'))), results.data);
    });

    it(`should be able to perform a basic GET multiple operation of something one layer deep`, async function () {
        let test_institution_1 = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_institution_2 = await institution.mongoose_model.create({
            name: 'the ordinary institute'
        });

        let test_clients = []
        for(let q = 0; q < 5; q++){
            let test_client = await client.mongoose_model.create({
                institution_id: test_institution_1._id,
                name: `test_client_${q}`
            });
            //@ts-ignore
            test_clients.push(test_client);

            // create a test client for the other institution to make sure
            // the endpoint doesn't return test clients from other institutions
            await client.mongoose_model.create({
                institution_id: test_institution_2._id,
                name: `test_client_${q}`
            });
        }

        let advanced_query = {
            $and: [{
                name: { $eq: 'test_client_3'}
            }]
        }
        
        let results = await got.get(`http://localhost:${port}/api/institution/${test_institution_1._id}/client?advanced_query=${JSON.stringify(advanced_query)}`).json();
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_clients.filter(ele => ele.name === 'test_client_3'))), results.data);
    });

    it(`should be able to perform a GET multiple operation with a limit`, async function () {
        let test_institutions = []
        for(let q = 0; q < 5; q++){
            let test_institution = await institution.mongoose_model.create({
                name: ['spandex co',
                    'the ordinary institute',
                    'saliva branding collective',
                    'united league of billionare communitsts',
                    'geriatric co',
                    'jousing club of omaha, nebraska',
                    'dental hygenist paratrooper union',
                    'martha stewart\'s cannibal fan club',
                    'wrecking ball operator crochet club',
                    'accidental co'
                ][q]
            });
            //@ts-ignore
            test_institutions.push(test_institution);
        }

        let advanced_query = {
            $and: [{
                name: { $in: ['spandex co', 'the ordinary institute', 'saliva branding collective', 'united league of billionare communitsts', 'geriatric co',]}
            }]
        }

        let results = await got.get(`http://localhost:${port}/api/institution?limit=2&advanced_query=${JSON.stringify(advanced_query)}`).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institutions)).slice(0, 2), results.data);
    });

    /*it(`should be able to perform a GET multiple operation with a cursor`, async function () {
        let test_institutions = []
        for(let q = 0; q < 5; q++){
            let test_institution = await institution.mongoose_model.create({
                name: ['spandex co',
                    'the ordinary institute',
                    'saliva branding collective',
                    'united league of billionare communitsts',
                    'geriatric co',
                    'jousing club of omaha, nebraska',
                    'dental hygenist paratrooper union',
                    'martha stewart\'s cannibal fan club',
                    'wrecking ball operator crochet club',
                    'accidental co'
                ][q]
            });
            //@ts-ignore
            test_institutions.push(test_institution);
        }

        let results = await got.get(`http://localhost:${port}/api/institution?cursor=${test_institutions[2]._id}`).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institutions)).slice(3), results.data);
    });

    it(`should be able to perform a GET multiple operation with a sort`, async function () {
        let test_institutions = []
        for(let q = 0; q < 5; q++){
            let test_institution = await institution.mongoose_model.create({
                name: ['spandex co',
                    'the ordinary institute',
                    'saliva branding collective',
                    'united league of billionare communitsts',
                    'geriatric co',
                    'jousing club of omaha, nebraska',
                    'dental hygenist paratrooper union',
                    'martha stewart\'s cannibal fan club',
                    'wrecking ball operator crochet club',
                    'accidental co'
                ][q]
            });
            //@ts-ignore
            test_institutions.push(test_institution);
        }

        let results = await got.get(`http://localhost:${port}/api/institution?sort=name`).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institutions)).sort((a, b) => a.name.localeCompare(b.name)), results.data);
    });

    it(`should be able to perform a GET multiple operation with a sort and sort order`, async function () {
        let test_institutions = []
        for(let q = 0; q < 5; q++){
            let test_institution = await institution.mongoose_model.create({
                name: ['spandex co',
                    'the ordinary institute',
                    'saliva branding collective',
                    'united league of billionare communitsts',
                    'geriatric co',
                    'jousing club of omaha, nebraska',
                    'dental hygenist paratrooper union',
                    'martha stewart\'s cannibal fan club',
                    'wrecking ball operator crochet club',
                    'accidental co'
                ][q]
            });
            //@ts-ignore
            test_institutions.push(test_institution);
        }

        let results = await got.get(`http://localhost:${port}/api/institution?sort=name&sort_order=descending`).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institutions)).sort((a, b) => b.name.localeCompare(a.name)), results.data);
    });

    it(`should be able to perform a GET multiple operation with a cursor and sort order descending`, async function () {
        let test_institutions = []
        for(let q = 0; q < 5; q++){
            let test_institution = await institution.mongoose_model.create({
                name: ['spandex co',
                    'the ordinary institute',
                    'saliva branding collective',
                    'united league of billionare communitsts',
                    'geriatric co',
                    'jousing club of omaha, nebraska',
                    'dental hygenist paratrooper union',
                    'martha stewart\'s cannibal fan club',
                    'wrecking ball operator crochet club',
                    'accidental co'
                ][q]
            });
            //@ts-ignore
            test_institutions.push(test_institution);
        }

        let results = await got.get(`http://localhost:${port}/api/institution?cursor=${test_institutions[2]._id}&sort_order=descending`).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institutions.slice().reverse().slice(3))), results.data);
    });

    it(`should be able to perform a GET multiple operation with a cursor and sort order ascending`, async function () {
        let test_institutions = []
        for(let q = 0; q < 5; q++){
            let test_institution = await institution.mongoose_model.create({
                name: ['spandex co',
                    'the ordinary institute',
                    'saliva branding collective',
                    'united league of billionare communitsts',
                    'geriatric co'
                ][q]
            });
            //@ts-ignore
            test_institutions.push(test_institution);
        }

        let results = await got.get(`http://localhost:${port}/api/institution?cursor=${test_institutions[2]._id}&sort_order=ascending`).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institutions.slice(3))), results.data);
    });

    it(`should break if you try to use both sort and cursor`, async function () {
        let test_institutions = []
        for(let q = 0; q < 5; q++){
            let test_institution = await institution.mongoose_model.create({
                name: ['spandex co',
                    'the ordinary institute',
                    'saliva branding collective',
                    'united league of billionare communitsts',
                    'geriatric co',
                    'jousing club of omaha, nebraska',
                    'dental hygenist paratrooper union',
                    'martha stewart\'s cannibal fan club',
                    'wrecking ball operator crochet club',
                    'accidental co'
                ][q]
            });
            //@ts-ignore
            test_institutions.push(test_institution);
        }

        await assert.rejects(async () => {
            return await got.get(`http://localhost:${port}/api/institution?sort=name&cursor=${test_institutions[2]._id}`).json();
        })
    });

    it(`should reject GET multiple operations with malicious keys in the query`, async function () {
        let test_institutions = []
        for(let q = 0; q < 5; q++){
            let test_institution = await institution.mongoose_model.create({
                name: ['spandex co',
                    'the ordinary institute',
                    'saliva branding collective',
                    'united league of billionare communitsts',
                    'geriatric co',
                    'jousing club of omaha, nebraska',
                    'dental hygenist paratrooper union',
                    'martha stewart\'s cannibal fan club',
                    'wrecking ball operator crochet club',
                    'accidental co'
                ][q]
            });
            //@ts-ignore
            test_institutions.push(test_institution);
        }

        await assert.rejects(async () => {
            let results = await got.get(`http://localhost:${port}/api/institution?$where=5`);
        })
    });


    it(`should be able to perform a basic GET multiple with a regex search`, async function () {
        let test_institutions = []
        for(let q = 0; q < 5; q++){
            let test_institution = await institution.mongoose_model.create({
                name: ['spandex co',
                    'the ordinary institute',
                    'saliva branding collective',
                    'united league of billionare communitsts',
                    'geriatric co',
                    'jousing club of omaha, nebraska',
                    'dental hygenist paratrooper union',
                    'martha stewart\'s cannibal fan club',
                    'wrecking ball operator crochet club',
                    'accidental co'
                ][q]
            });
            //@ts-ignore
            test_institutions.push(test_institution);
        }

        let results = await got.get(`http://localhost:${port}/api/institution?name_search=li`).json();

        //@ts-ignore
        assert.equal(results.data.length, 2)
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institutions.filter(ele => ele.name.match(/li/i)))), results.data);
    });*/
});
