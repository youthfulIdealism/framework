
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

describe('Basic Server', function () {
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
     /////////////////////////////////////////////////////////////    GET one        ////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    it(`should be able to perform a basic GET operation`, async function () {
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let results = await got.get(`http://localhost:${port}/api/institution/${test_institution._id}`).json();
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institution)), results.data);
    });

    it(`should be able to perform a basic GET operation of something one layer deep`, async function () {
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let results = await got.get(`http://localhost:${port}/api/institution/${test_institution._id}/client/${test_client._id}`).json();
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_client)), results.data);
    });

    it(`should be able to perform a basic GET operation of a leaf`, async function () {
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let test_project = await project.mongoose_model.create({
            institution_id: test_institution._id,
            client_id: test_client._id,
            name: `Spandex Reincarnation`
        })

        let results = await got.get(`http://localhost:${port}/api/institution/${test_institution._id}/client/${test_client._id}/project/${test_project._id}`).json();
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_project)), results.data);
    });

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

        let results = await got.get(`http://localhost:${port}/api/institution`).json();
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institutions)), results.data);
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

        let results = await got.get(`http://localhost:${port}/api/institution/${test_institution_1._id}/client`).json();
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_clients)), results.data);
    });

    it(`should be able to perform a basic GET multiple operation of a leaf`, async function () {
        let test_institution_1 = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_client_1 = await client.mongoose_model.create({
            institution_id: test_institution_1._id,
            name: `Bob's spandex house`
        })

        let test_institution_2 = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_client_2 = await client.mongoose_model.create({
            institution_id: test_institution_2._id,
            name: `Bob's spandex house`
        })

        let test_projects = []
        for(let q = 0; q < 5; q++){
            let test_client = await project.mongoose_model.create({
                institution_id: test_institution_1._id,
                client_id: test_client_1._id,
                name: `Spandex Reincarnation`
            });
            //@ts-ignore
            test_projects.push(test_client);

            // create a test project for the other institution to make sure
            // the endpoint doesn't return test project from other institutions
            await project.mongoose_model.create({
                institution_id: test_institution_2._id,
                client_id: test_client_2._id,
                name: `Spandex Reincarnation`
            });
        }

        let results = await got.get(`http://localhost:${port}/api/institution/${test_institution_1._id}/client/${test_client_1._id}/project`).json();
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_projects)), results.data);
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

        let results = await got.get(`http://localhost:${port}/api/institution?limit=2`).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institutions)).slice(0, 2), results.data);
    });

    it(`should be able to perform a GET multiple operation with a cursor`, async function () {
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

      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    PUT        ////////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



    it(`should be able to perform a basic PUT operation`, async function () {
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let results = await got.put(`http://localhost:${port}/api/institution/${test_institution._id}`, {
            json: {
                name: 'Leather Pants Co'
            },
        }).json();

        //@ts-ignore
        assert.notDeepEqual(JSON.parse(JSON.stringify(test_institution)), results.data);
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await institution.mongoose_model.findById(test_institution._id))), results.data);
    });

    it(`should be able to perform a basic PUT operation of something one layer deep`, async function () {
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let results = await got.put(`http://localhost:${port}/api/institution/${test_institution._id}/client/${test_client._id}`, {
            json: {
                name: `International house of leather pants`
            },
        }).json();
        //@ts-ignore
        assert.notDeepEqual(JSON.parse(JSON.stringify(test_client)), results.data);
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await client.mongoose_model.findById(test_client._id))), results.data);
    });

    it(`should be able to perform a basic PUT operation of a leaf`, async function () {
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let test_project = await project.mongoose_model.create({
            institution_id: test_institution._id,
            client_id: test_client._id,
            name: `Spandex Reincarnation`
        })

        let results = await got.put(`http://localhost:${port}/api/institution/${test_institution._id}/client/${test_client._id}/project/${test_project._id}`, {
            json: {
                name: `Leather Pants Transubstantiation`
            },
        }).json();
        //@ts-ignore
        assert.notDeepEqual(JSON.parse(JSON.stringify(test_project)), results.data);
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await project.mongoose_model.findById(test_project._id))), results.data);
    });

    it(`should reject a PUT operation that changes layer membership`, async function () {
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let test_client_2 = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Anna's Latex Emporium`
        })

        let test_project = await project.mongoose_model.create({
            institution_id: test_institution._id,
            client_id: test_client._id,
            name: `Spandex Reincarnation`
        })

        await assert.rejects(async () => {
            let results = await got.put(`http://localhost:${port}/api/institution/${test_institution._id}/client/${test_client._id}/project/${test_project._id}`, {
                json: {
                    name: `Leather Pants Transubstantiation`,
                    client_id: test_client_2._id

                },
            }).json();
        }, {
            message: 'Response code 403 (Forbidden)'
        });
    });

    it(`should reject a PUT operation that changes the document id`, async function () {
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let test_project = await project.mongoose_model.create({
            institution_id: test_institution._id,
            client_id: test_client._id,
            name: `Spandex Reincarnation`
        })

        let test_project_2 = await project.mongoose_model.create({
            institution_id: test_institution._id,
            client_id: test_client._id,
            name: `Olfactory Hurricane`
        })

        await assert.rejects(async () => {
            let results = await got.put(`http://localhost:${port}/api/institution/${test_institution._id}/client/${test_client._id}/project/${test_project._id}`, {
                json: {
                    _id: test_project_2._id,
                    name: `Leather Pants Transubstantiation`,
                },
            }).json();
        }, {
            message: 'Response code 400 (Bad Request)'
        });
    });

    it(`should reject a PUT operation with a malicious key in the body`, async function () {
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        await assert.rejects(async () => {
            let results = await got.put(`http://localhost:${port}/api/institution/${test_institution._id}`, {
                json: {
                    name: 'Leather Pants Co',
                    meta: {
                        $sum: { test: true}
                    }
                },
            }).json();
        }, {
            message: 'Response code 403 (Forbidden)'
        });
    });

      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    POST        ///////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should be able to perform a basic POST operation`, async function () {
        let results = await got.post(`http://localhost:${port}/api/institution`, {
            json: {
                name: 'Leather Pants Co'
            },
        }).json();
        
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await institution.mongoose_model.findById(results.data._id))), results.data);
    });

    it(`should be able to perform a basic POST operation of something one layer deep`, async function () {
        this.timeout(1000 * 20);
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let results = await got.post(`http://localhost:${port}/api/institution/${test_institution._id}/client`, {
            json: {
                name: `International house of leather pants`,
                institution_id: test_institution._id,
            },
        }).json();
        
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await client.mongoose_model.findById(results.data._id))), results.data);
    });

    it(`should be able to perform a basic POST operation of a leaf`, async function () {
        this.timeout(1000 * 20);
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let results = await got.post(`http://localhost:${port}/api/institution/${test_institution._id}/client/${test_client._id}/project`, {
            json: {
                name: `Leather Pants Transubstantiation`,
                institution_id: test_institution._id,
                client_id: test_client._id,
            },
        }).json();
        
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await project.mongoose_model.findById(results.data._id))), results.data);
    });

    it(`should reject a POST operation at the wrong layer membership`, async function () {
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let test_client_2 = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Anna's Latex Emporium`
        })

        await assert.rejects(async () => {
            let results = await got.post(`http://localhost:${port}/api/institution/${test_institution._id}/client/${test_client._id}/project`, {
                json: {
                    name: `Leather Pants Transubstantiation`,
                    client_id: test_client_2._id,
                    institution_id: test_institution._id,
                },
            }).json();
        }, {
            message: 'Response code 403 (Forbidden)'
        });
    });

    it(`should reject a POST operation with malicious keys in the body`, async function () {
        await assert.rejects(async () => {
            let results = await got.post(`http://localhost:${port}/api/institution`, {
                json: {
                    name: 'Leather Pants Co',
                    meta: {
                        $sum: {test: true}
                    }
                },
            }).json();
        }, {
            message: 'Response code 403 (Forbidden)'
        });
    });
            

      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    DELETE        /////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    
    it(`should be able to perform a basic DELETE operation`, async function () {

        let test_institution = await institution.mongoose_model.create({
            name: 'test institution'
        })

        let results = await got.delete(`http://localhost:${port}/api/institution/${test_institution._id}`).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_institution)), results.data);
        assert.deepEqual(JSON.parse(JSON.stringify(await institution.mongoose_model.findById(test_institution._id))), undefined);
    });

    it(`should be able to perform a basic DELETE operation of something one layer deep`, async function () {
        let test_institution = await institution.mongoose_model.create({
            name: 'test institution'
        })

        let test_client = await client.mongoose_model.create({
            name: 'test client',
            institution_id: test_institution._id
        })

        let results = await got.delete(`http://localhost:${port}/api/institution/${test_institution._id}/client/${test_client._id}`).json();
        
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_client)), results.data);
        assert.deepEqual(JSON.parse(JSON.stringify(await client.mongoose_model.findById(test_client._id))), undefined);
    });

    it(`should be able to perform a basic DELETE operation of a leaf`, async function () {
        this.timeout(1000 * 20);
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let test_project = await project.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`,
            client_id: test_client._id,
        })

        let results = await got.delete(`http://localhost:${port}/api/institution/${test_institution._id}/client/${test_client._id}/project/${test_project._id}`).json();
        
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(test_project)), results.data);
        assert.deepEqual(JSON.parse(JSON.stringify(await project.mongoose_model.findById(test_project._id))), undefined);
    });

    it(`should reject a DELETE operation at the wrong layer membership`, async function () {
        let test_institution = await institution.mongoose_model.create({
            name: 'Spandex Co'
        });

        let test_client = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`
        })

        let test_client_2 = await client.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Anna's Latex Emporium`
        })

        let test_project = await project.mongoose_model.create({
            institution_id: test_institution._id,
            name: `Bob's spandex house`,
            client_id: test_client_2._id,
        })

        let results = await got.delete(`http://localhost:${port}/api/institution/${test_institution._id}/client/${test_client._id}/project/${test_project._id}`).json();
        
        // this will just produce null rather than throwing an error, because there was nothing at the path to delete.
        // this is different than a POST or PUT, where it's easier to detect a mismatch because the body may have an
        // institution ID.
        //@ts-ignore
        assert.deepEqual(null, results.data);
        assert.deepEqual(JSON.parse(JSON.stringify(await project.mongoose_model.findById(test_project._id))), JSON.parse(JSON.stringify(test_project)));
    });

    it(`should allow entries to be added to object arrays`, async function () {
        let test_list_container = await list_container.mongoose_model.create({
            container: {
                list: []
            }
        });

        let results = await got.post(`http://localhost:${port}/api/list_container/${test_list_container._id}/container.list`, {
            json: {
                value: 'test value'
            }
        }).json();
        
        //@ts-ignore
        assert.deepEqual('test value', results.data.container.list[0].value);
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await list_container.mongoose_model.findById(test_list_container._id))), JSON.parse(JSON.stringify(results.data)));
    });

    it(`should allow object array entries to be updated`, async function () {
        let test_list_container = await list_container.mongoose_model.create({
            container: {
                list: [{
                    value: 'original value'
                }]
            }
        });

        let results = await got.put(`http://localhost:${port}/api/list_container/${test_list_container._id}/container.list/${test_list_container.container.list[0]._id}`, {
            json: {
                value: 'updated value'
            }
        }).json();
        
        //@ts-ignore
        assert.deepEqual('updated value', results.data.container.list[0].value);
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await list_container.mongoose_model.findById(test_list_container._id))), JSON.parse(JSON.stringify(results.data)));
    });

    it(`should allow object array entries to be deleted`, async function () {
        let test_list_container = await list_container.mongoose_model.create({
            container: {
                list: [{
                    value: 'original value'
                }]
            }
        });

        let results = await got.delete(`http://localhost:${port}/api/list_container/${test_list_container._id}/container.list/${test_list_container.container.list[0]._id}`).json();
        
        //@ts-ignore
        assert.deepEqual(0, results.data.container.list.length);
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await list_container.mongoose_model.findById(test_list_container._id))), JSON.parse(JSON.stringify(results.data)));
    });
    
});
