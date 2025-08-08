
import assert from "assert";

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
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

describe('Basic Server', function () {
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
        institution_id: z_mongodb_id,
        name: z.string(),
    });
    const validate_project = z.object({
        _id: z_mongodb_id,
        institution_id: z_mongodb_id,
        client_id: z_mongodb_id,
        name: z.string(),
    });

    let institution: F_Collection<'institution', typeof validate_institution>;
    let client: F_Collection<'client', typeof validate_client>;
    let project: F_Collection<'project', typeof validate_project>;

    let registry: F_Collection_Registry;
    

    // before any tests run, set up the server and the db connection
    before(async function() {
        express_app = express();
        express_app.use(express.json());
        db_connection = await mongoose.connect('mongodb://127.0.0.1:27017/');

        // if we define these in mocha's describe() function, it runs before connecting to the database.
        // this causes the mongoose definitions to get attached to a database instance that is closed at
        // the end of the previous test, spawning a MongoNotConnectedError error.
        institution = new F_Collection('institution', validate_institution);
        institution.add_layers([], [new F_SM_Open_Access(institution)]);

        client = new F_Collection('client', validate_client);
        client.add_layers([institution.collection_id], [new F_SM_Open_Access(client)]);

        project = new F_Collection('project', validate_project);
        project.add_layers([institution.collection_id, client.collection_id], [new F_SM_Open_Access(project)]);

        // build registry
        let proto_registry = new F_Collection_Registry();
        registry = proto_registry.register(institution).register(client).register(project);
        registry.compile(express_app, '/api');

        server = express_app.listen(port);

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
            // @ts-ignore
            collection.model.collection.drop();
        }
    })

    it(`should be able to perform a basic GET operation`, async function () {
        let test_institution = await institution.model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let results = await got.get(`http://localhost:${port}/api/institution/${test_institution._id}`).json();
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institution)), results.data);
    });

    it(`should be able to perform a basic GET operation of something one layer deep`, async function () {
        let test_institution = await institution.model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let results = await got.get(`http://localhost:${port}/api/institution/${test_institution._id}/client/${test_client._id}`).json();
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_client)), results.data);
    });

    it(`should be able to perform a basic GET operation of a leaf`, async function () {
        let test_institution = await institution.model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let test_project = await project.model.create({
            institution_id: test_institution._id,
            client_id: test_client._id,
            name: `Spandex Reincarnation`
        })

        let results = await got.get(`http://localhost:${port}/api/institution/${test_institution._id}/client/${test_client._id}/project/${test_project._id}`).json();
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_project)), results.data);
    });

    it(`should be able to perform a basic GET multiple operation`, async function () {
        let test_institutions = []
        for(let q = 0; q < 5; q++){
            let test_institution = await institution.model.create({
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

        let results = await got.get(`http://localhost:${port}/api/institution`).json();
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institutions)), results.data);
    });

    it(`should be able to perform a basic GET multiple operation of something one layer deep`, async function () {
        let test_institution_1 = await institution.model.create({
            name: 'Spandex Co'
        });

        let test_institution_2 = await institution.model.create({
            name: 'the ordinary institute'
        });

        let test_clients = []
        for(let q = 0; q < 5; q++){
            let test_client = await client.model.create({
                institution_id: test_institution_1._id,
                name: `test_client_${q}`
            });
            //@ts-ignore
            test_clients.push(test_client);

            // create a test client for the other institution to make sure
            // the endpoint doesn't return test clients from other institutions
            await client.model.create({
                institution_id: test_institution_2._id,
                name: `test_client_${q}`
            });
        }

        let results = await got.get(`http://localhost:${port}/api/institution/${test_institution_1._id}/client`).json();
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_clients)), results.data);
    });

    it(`should be able to perform a basic GET multiple operation of a leaf`, async function () {
        let test_institution_1 = await institution.model.create({
            name: 'Spandex Co'
        });

        let test_client_1 = await client.model.create({
            institution_id: test_institution_1._id,
            name: `Bob's spandex house`
        })

        let test_institution_2 = await institution.model.create({
            name: 'Spandex Co'
        });

        let test_client_2 = await client.model.create({
            institution_id: test_institution_2._id,
            name: `Bob's spandex house`
        })

        let test_projects = []
        for(let q = 0; q < 5; q++){
            let test_client = await project.model.create({
                institution_id: test_institution_1._id,
                client_id: test_client_1._id,
                name: `Spandex Reincarnation`
            });
            //@ts-ignore
            test_projects.push(test_client);

            // create a test project for the other institution to make sure
            // the endpoint doesn't return test project from other institutions
            await project.model.create({
                institution_id: test_institution_2._id,
                client_id: test_client_2._id,
                name: `Spandex Reincarnation`
            });
        }

        let results = await got.get(`http://localhost:${port}/api/institution/${test_institution_1._id}/client/${test_client_1._id}/project`).json();
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_projects)), results.data);
    });

});
