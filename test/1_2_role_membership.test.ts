
import assert from "assert";

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { F_Collection } from '../dist/f_collection.js';
import { F_Collection_Registry } from '../dist/F_Collection_Registry.js'
import { F_SM_Open_Access } from '../dist/F_Security_Models/F_SM_Open_Access.js'
import { F_SM_Role_Membership } from '../dist/F_Security_Models/F_SM_Role_Membership.js'
import { Auth_Data, F_Security_Model } from '../dist/F_Security_Models/F_Security_Model.js'
import { Cache } from '../dist/utils/cache.js'
import { z, ZodAny, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'

import got from 'got'
import express, { Express, Request, Response, NextFunction } from 'express'
import mongoose, { Mongoose } from "mongoose";
import { Server } from "http";

// IF YOU RUN THESE TESTS ON THEIR OWN, THEY WORK FINE
// there's something janky going on with the mongodb or express
// setup/teardown that's causing them to fail when run with the other tests
describe('Security Model Role Membership', function () {
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
        client_ids: z.array(z_mongodb_id).optional(),
        name: z.string(),
    });
    const validate_project = z.object({
        _id: z_mongodb_id,
        institution_id: z_mongodb_id,
        client_id: z_mongodb_id,
        name: z.string(),
        steps: z.array(z.object({
            _id: z_mongodb_id,
            name: z.string()
        }))
    });
    let validate_user = z.object({
        _id: z_mongodb_id,
        auth_id: z.string(),
    });
    let validate_role = z.object({
        _id: z_mongodb_id,
        name: z.string(),
        institution_id: z_mongodb_id,
        permissions: z.object({
            institutions: z.array(z.enum(['read', 'create', 'update', 'delete'])),
            clients: z.array(z.enum(['read', 'create', 'update', 'delete'])),
            projects: z.array(z.enum(['read', 'create', 'update', 'delete'])),
            roles: z.array(z.enum(['read', 'create', 'update', 'delete'])),
        })
    })
    let validate_institution_role_membership = z.object({
        _id: z_mongodb_id,
        institution_id: z_mongodb_id,
        user_id: z_mongodb_id,
        role_id: z_mongodb_id,
    })
    let validate_client_role_membership = z.object({
        _id: z_mongodb_id,
        institution_id: z_mongodb_id,
        client_id: z_mongodb_id,
        user_id: z_mongodb_id,
        role_id: z_mongodb_id,
    })

    
    let collection_institution: F_Collection<'institution', typeof validate_institution>;
    let collection_client: F_Collection<'client', typeof validate_client>;
    let collection_project: F_Collection<'project', typeof validate_project>;
    let collection_user: F_Collection<'user', typeof validate_user>;
    let collection_role: F_Collection<'role', typeof validate_role>;
    let collection_institution_role_membership: F_Collection<'institution_role_membership', typeof validate_institution_role_membership>;
    let collection_client_role_membership: F_Collection<'client_role_membership', typeof validate_client_role_membership>;



    // build registry
    let registry: F_Collection_Registry;

    // before any tests run, set up the server and the db connection
    before(async function() {
        express_app = express();
        express_app.use(express.json());
        db_connection = await mongoose.connect('mongodb://127.0.0.1:27017/');
        //console.log('connected')
        //console.log(db_connection)

        let cache_role = new Cache(60);
        let cache_institution_role_membership = new Cache(60);
        let cache_client_role_membership = new Cache(60);

        collection_institution = new F_Collection('institution', 'institutions', validate_institution);
        collection_client = new F_Collection('client', 'clients', validate_client);
        collection_project = new F_Collection('project', 'projects', validate_project);
        collection_user = new F_Collection('user', 'users', validate_user);
        collection_role = new F_Collection('role', 'roles', validate_role);
        collection_institution_role_membership = new F_Collection('institution_role_membership', 'institution_role_memberships', validate_institution_role_membership);
        collection_client_role_membership = new F_Collection('client_role_membership', 'client_role_memberships', validate_client_role_membership);

        collection_institution.add_layers([], [new F_SM_Role_Membership(collection_institution, collection_institution)]);

        collection_client.add_layers(['institution'], [new F_SM_Role_Membership(collection_client, collection_institution)]);

        // clients can also nest inside other clients, forming a tree. a client's client_ids field
        // holds every ancestor client, so it can be reached (and its role membership checked) through
        // any ancestor, not just its direct parent.
        collection_client.add_layers(['institution', 'client'], [
            new F_SM_Role_Membership(collection_client, collection_institution),
            new F_SM_Role_Membership(collection_client, collection_client)
        ]);

        collection_project.add_layers(['institution', 'client'], [
            new F_SM_Role_Membership(collection_project, collection_institution),
            new F_SM_Role_Membership(collection_project, collection_client)
        ]);

        let proto_registry = new F_Collection_Registry();
        registry = proto_registry.register(collection_user)
            .register(collection_institution)
            .register(collection_client)
            .register(collection_project)
            .register(collection_user)
            .register(collection_role)
            .register(collection_institution_role_membership)
            .register(collection_client_role_membership);

        F_Security_Model.set_auth_fetcher(async (req: Request) => {
            if(!req.headers.authorization){ return undefined; }

            let user_record = await collection_user.mongoose_model.findOne({auth_id: req.headers.authorization}).lean()
            if(!user_record){ return undefined; }
            let layers: (Auth_Data['layers']) = [];

            let institution_role_memberships = await collection_institution_role_membership.mongoose_model.find({ user_id: user_record._id }).lean();
            let client_role_memberships = await collection_client_role_membership.mongoose_model.find({ user_id: user_record._id }).lean();
            let institution_role_ids = institution_role_memberships.map(ele => ele.role_id );
            let client_role_ids = client_role_memberships.map(ele => ele.role_id );
            let all_role_ids = Array.from(new Set([...institution_role_ids, ...client_role_ids]));
            let roles = await collection_role.mongoose_model.find({ _id: { $in: all_role_ids }}).lean();

            for(let role_membership of institution_role_memberships){
                let role = roles.find(ele => ele._id + '' === role_membership.role_id + '');
                if(!role) { continue; }
                layers.push({
                    layer: 'institution',
                    layer_id: role_membership.institution_id,
                    //@ts-ignore
                    permissions: role.permissions,
                    special_permissions: {}
                })
            }

            for(let role_membership of client_role_memberships){
                let role = roles.find(ele => ele._id + '' === role_membership.role_id + '');
                if(!role) { continue; }
                layers.push({
                    layer: 'client',
                    layer_id: role_membership.client_id,
                    //@ts-ignore
                    permissions: role.permissions,
                    special_permissions: {}
                })
            }

            return { user_id: user_record._id, layers: layers };
        })
        registry.compile(express_app, '/api');

        server = express_app.listen(port);

        // wait for a moment because otherwise stuff breaks for no reason
        await new Promise(resolve => setTimeout(resolve, 200))
    })

    after(async function (){
        await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
        mongoose.connection.modelNames().forEach(ele => mongoose.connection.deleteModel(ele));
        db_connection.modelNames().forEach(ele => db_connection.deleteModel(ele));
        
        await new Promise(resolve => setTimeout(resolve, 500))
        //console.log(db_connection);
        //console.log(db_connection.connection.readyState);

        await db_connection.disconnect()

        await new Promise(resolve => setTimeout(resolve, 500))
    });

    beforeEach(async function(){
        for(let collection of Object.values(registry.collections)){
            //@ts-ignore
            await collection.mongoose_model.collection.drop();
        }
        await new Promise(resolve => setTimeout(resolve, 500))
    })

    /**
     * generates a default DB with the following structure:
     * - steve institution
     * - - steve client
     * - - - steve project
     * - - joe client
     * - - - joe project
     * - edwin institution
     * - - nathan client
     * - - - nathan project
     * - - edna client
     * - - - edna project
     * 
     * The user steve has project read, write, update, and create access for the institution "steve institution".
     * Steve also has a client role that grants him RWUC access to the nathan client, and a client role that grants
     * him no project permissions to the edna client.
     * 
     * The user edwin has project RWUC access for the "edwin institution". He does not have any client permissions in the steve institution 
     * @returns 
     */
    async function generate_test_setup(){
        let user_steve = await collection_user.mongoose_model.create({
            auth_id: 'steve'
        });

        let user_edwin = await collection_user.mongoose_model.create({
            auth_id: 'edwin'
        });

        let steve_institution = await collection_institution.mongoose_model.create({
            name: `steve institution`
        });

        let edwin_institution = await collection_institution.mongoose_model.create({
            name: `edwin institution`
        });

        let steve_client = await collection_client.mongoose_model.create({
            institution_id: steve_institution._id,
            name: 'steve client'
        })

        let joe_client = await collection_client.mongoose_model.create({
            institution_id: steve_institution._id,
            name: 'joe client'
        })

        let nathan_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            name: 'nathan client'
        })

        let edna_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            name: 'edna client'
        })

        let steve_project = await collection_project.mongoose_model.create({
            institution_id: steve_institution._id,
            client_id: steve_client._id,
            name: 'steve project',
            steps: [],
        })

        let joe_project = await collection_project.mongoose_model.create({
            institution_id: steve_institution._id,
            client_id: joe_client._id,
            name: 'joe project',
            steps: [],
        })

        let nathan_project = await collection_project.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_id: nathan_client._id,
            name: 'nathan project',
            steps: [],
        })

        let edna_project = await collection_project.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_id: edna_client._id,
            name: 'edna project',
            steps: [],
        })

        let access_role_steve_institution_grants_project = await collection_role.mongoose_model.create({
            name: 'steve full access',
            institution_id: steve_institution._id,
            permissions: {
                institutions: ['read', 'create', 'update', 'delete'],
                clients: ['read', 'create', 'update', 'delete'],
                projects: ['read', 'create', 'update', 'delete'],
                roles: ['read', 'create', 'update', 'delete'],
            }
        });

        let access_role_steve_institution_grants_minimal = await collection_role.mongoose_model.create({
            name: 'steve limited access',
            institution_id: steve_institution._id,
            permissions: {
                institutions: ['read'],
                clients: ['read'],
                projects: [],
                roles: ['read'],
            }
        });

         let access_role_edwin_institution_grants_project = await collection_role.mongoose_model.create({
            name: 'edwin full access',
            institution_id: edwin_institution._id,
            permissions: {
                institutions: ['read', 'create', 'update', 'delete'],
                clients: ['read', 'create', 'update', 'delete'],
                projects: ['read', 'create', 'update', 'delete'],
                roles: ['read', 'create', 'update', 'delete'],
            }
        });

        let access_role_edwin_institution_grants_minimal = await collection_role.mongoose_model.create({
            name: 'edwin limited access',
            institution_id: edwin_institution._id,
            permissions: {
                institutions: ['read'],
                clients: ['read'],
                projects: [],
                roles: ['read'],
            }
        });

        let steve_steve_institution_role_membership = await collection_institution_role_membership.mongoose_model.create({
            role_id: access_role_steve_institution_grants_project._id,
            user_id: user_steve._id,
            institution_id: steve_institution._id,
        })

        let steve_edwin_institution_role_membership = await collection_institution_role_membership.mongoose_model.create({
            role_id: access_role_edwin_institution_grants_minimal._id,
            user_id: user_steve._id,
            institution_id: edwin_institution._id,
        })

        let steve_nathan_client_role_membership = await collection_client_role_membership.mongoose_model.create({
            role_id: access_role_edwin_institution_grants_project._id,
            user_id: user_steve._id,
            institution_id: edwin_institution._id,
            client_id: nathan_client._id
        })

        let steve_edna_client_role_membership = await collection_client_role_membership.mongoose_model.create({
            role_id: access_role_edwin_institution_grants_minimal._id,
            user_id: user_steve._id,
            institution_id: edwin_institution._id,
            client_id: edna_client._id
        })
        
        let edwin_edwin_institution_role_membership = await collection_institution_role_membership.mongoose_model.create({
            role_id: access_role_edwin_institution_grants_project._id,
            user_id: user_edwin._id,
            institution_id: edwin_institution._id,
        })

        return {
            user_steve,
            user_edwin,
            steve_institution,
            edwin_institution,
            steve_client,
            joe_client,
            nathan_client,
            edna_client,
            steve_project,
            joe_project,
            nathan_project,
            edna_project,
            access_role_steve_institution_grants_project,
            access_role_steve_institution_grants_minimal,
            access_role_edwin_institution_grants_project,
            access_role_edwin_institution_grants_minimal,
            steve_steve_institution_role_membership,
            steve_edwin_institution_role_membership,
            steve_nathan_client_role_membership,
            steve_edna_client_role_membership,
            edwin_edwin_institution_role_membership,
        }
    }


      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    GET one        ////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should authorize a basic GET operation on a document where the user has a T1 role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();
        let results = await got.get(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(steve_project)), results.data);
    });

    it(`should authorize a basic GET operation on a document where the user has a T2 role membership`, async function () {
        let { edwin_institution, nathan_client, nathan_project } = await generate_test_setup();

        let results = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/project/${nathan_project._id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(nathan_project)), results.data);
    });

    it(`should reject a basic GET operation on a document where the user has a role membership without permission`, async function () {
        let { edwin_institution, edna_client, edna_project } = await generate_test_setup();

        await assert.rejects(async () => {
            let results = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/project/${edna_project._id}`, {
                headers: {
                    authorization: 'steve'
                }
            }).json();
        })
    });

    it(`should reject a basic GET operation on a document where the user has no role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        await assert.rejects(async () => {
            let results = await got.get(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}`, {
                headers: {
                    authorization: 'edwin'
                }
            }).json();
        })
    });

    it(`should authorize a basic GET operation on a layer collection`, async function () {
        let { steve_institution } = await generate_test_setup();


        let results = await got.get(`http://localhost:${port}/api/institution/${steve_institution._id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(steve_institution)), results.data);
    });


      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    GET multiple        ///////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should authorize a basic GET multiple operation where the user has a T1 role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        let projects = [steve_project];
        for(let q = 0; q < 5; q++){
            projects.push(await collection_project.mongoose_model.create({
                institution_id: steve_institution._id,
                client_id: steve_client._id,
                name: `additional project ${q}`,
                steps: [],
            }))
        }

        let results = await got.get(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(projects)), results.data);
    });

    it(`should authorize a basic GET multiple operation where the user has a T2 role membership`, async function () {
        let { edwin_institution, nathan_client, nathan_project } = await generate_test_setup();

        let projects = [nathan_project];
        for(let q = 0; q < 5; q++){
            projects.push(await collection_project.mongoose_model.create({
                institution_id: edwin_institution._id,
                client_id: nathan_client._id,
                name: `additional project ${q}`,
                steps: [],
            }))
        }

        let results = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/project`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(projects)), results.data);
    });

    it(`should reject a basic GET multiple operation where the user has a role membership without permission`, async function () {
        let { edwin_institution, edna_client, edna_project } = await generate_test_setup();

        let projects = [edna_project];
        for(let q = 0; q < 5; q++){
            projects.push(await collection_project.mongoose_model.create({
                institution_id: edwin_institution._id,
                client_id: edna_client._id,
                name: `additional project ${q}`,
                steps: [],
            }))
        }

        await assert.rejects(async () => {
            let results = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/project`, {
                headers: {
                    authorization: 'steve'
                }
            }).json();
        })
    });

    it(`should reject a basic GET multiple operation where the user has no role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        let projects = [steve_project];
        for(let q = 0; q < 5; q++){
            projects.push(await collection_project.mongoose_model.create({
                institution_id: steve_institution._id,
                client_id: steve_client._id,
                name: `additional project ${q}`,
                steps: [],
            }))
        }

        await assert.rejects(async () => {
            let results = await got.get(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project`, {
                headers: {
                    authorization: 'edwin'
                }
            }).json();
        })
    });





      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    PUT        ////////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should authorize a basic PUT operation on a document where the user has a T1 role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        let results = await got.put(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                name: 'Flammable Project'
            }
        }).json();

        //@ts-ignore
        assert.notDeepEqual(JSON.parse(JSON.stringify(steve_project)), results.data);
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_project.mongoose_model.findById(steve_project._id))), results.data);
    });

    it(`should authorize a basic PUT operation on a document where the user has a T2 role membership`, async function () {
        let { edwin_institution, nathan_client, nathan_project } = await generate_test_setup();

        let results = await got.put(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/project/${nathan_project._id}`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                name: 'Flammable Project'
            }
        }).json();

        //@ts-ignore
        assert.notDeepEqual(JSON.parse(JSON.stringify(nathan_project)), results.data);
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_project.mongoose_model.findById(nathan_project._id))), results.data);
    });

    it(`should reject a basic PUT operation on a document where the user has a role membership without permission`, async function () {
        let { edwin_institution, edna_client, edna_project } = await generate_test_setup();

        await assert.rejects(async () => {
            let results = await got.put(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/project/${edna_project._id}`, {
                headers: {
                    authorization: 'steve'
                },
                json: {
                    name: 'Flammable Project'
                }
            }).json();
        })
    });

    it(`should reject a basic PUT operation on a document where the user has no role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        await assert.rejects(async () => {
            let results = await got.put(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}`, {
                headers: {
                    authorization: 'edwin'
                },
                json: {
                    name: 'Flammable Project'
                }
            }).json();
        })
    });

      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    POST        ///////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should authorize a basic POST operation on a document where the user has a T1 role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        let results = await got.post(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                name: 'Flammable Project',
                institution_id: steve_institution._id,
                client_id: steve_client._id,
                steps: [],
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_project.mongoose_model.findById(results.data._id))), results.data);
    });

    it(`should authorize a basic POST operation on a document where the user has a T2 role membership`, async function () {
        let { edwin_institution, nathan_client, nathan_project } = await generate_test_setup();

        let results = await got.post(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/project`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                name: 'Flammable Project',
                institution_id: edwin_institution._id,
                client_id: nathan_client._id,
                steps: [],
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_project.mongoose_model.findById(results.data._id))), results.data);
    });

    it(`should reject a basic POST operation on a document where the user has a role membership without permission`, async function () {
        let { edwin_institution, edna_client, edna_project } = await generate_test_setup();

        await assert.rejects(async () => {
            let results = await got.post(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/project`, {
                headers: {
                    authorization: 'steve'
                },
                json: {
                    name: 'Flammable Project',
                    institution_id: edwin_institution._id,
                    client_id: edna_client._id,
                    steps: [],
                }
            }).json();
        })
    });

    it(`should reject a basic POST operation on a document where the user has no role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        await assert.rejects(async () => {
            let results = await got.post(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project`, {
                headers: {
                    authorization: 'edwin'
                },
                json: {
                    name: 'Flammable Project',
                    institution_id: steve_institution._id,
                    client_id: steve_client._id,
                }
            }).json();
        })
    });


      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    DELETE        /////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should authorize a basic DELETE operation on a document where the user has a T1 role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        let results = await got.delete(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(steve_project)), results.data);
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_project.mongoose_model.findById(steve_project._id))), undefined);
    });

    it(`should authorize a basic DELETE operation on a document where the user has a T2 role membership`, async function () {
        let { edwin_institution, nathan_client, nathan_project } = await generate_test_setup();

        let results = await got.delete(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/project/${nathan_project._id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(nathan_project)), results.data);
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_project.mongoose_model.findById(nathan_project._id))), undefined);
    });

    it(`should reject a basic DELETE operation on a document where the user has a role membership without permission`, async function () {
        let { edwin_institution, edna_client, edna_project } = await generate_test_setup();

        await assert.rejects(async () => {
            let results = await got.delete(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/project/${edna_project._id}`, {
                headers: {
                    authorization: 'steve'
                }
            }).json();
        })
    });

    it(`should reject a basic DELETE operation on a document where the user has no role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        await assert.rejects(async () => {
            let results = await got.delete(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}`, {
                headers: {
                    authorization: 'edwin'
                }
            }).json();
        })
    });


      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    ARRAY OPERATIONS     //////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should authorize a basic POST operation on a document's array children where the user has a T1 role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        let results = await got.post(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}/steps`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                name: 'Fancy Step'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_project.mongoose_model.findById(steve_project._id))), results.data);
        assert.equal((await collection_project.mongoose_model.findById(steve_project._id))?.steps.length, 1)
    });

    it(`should authorize a basic PUT operation on a document's array children where the user has a T1 role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        //@ts-ignore
        steve_project = await collection_project.mongoose_model.findByIdAndUpdate(steve_project._id, {
            $push: {
                steps: {
                    name: 'Fancy Step'
                }
            }
        }, {returnDocument: 'after'}).lean();
        let step_id = steve_project.steps[0]._id;

        let results = await got.put(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}/steps/${step_id}`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                _id: step_id,
                name: 'Somber Step'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_project.mongoose_model.findById(steve_project._id))), results.data);
        assert.equal((await collection_project.mongoose_model.findById(steve_project._id))?.steps[0].name, 'Somber Step')
    });

    it(`should authorize a basic DELETE operation on a document's array children where the user has a T1 role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        //@ts-ignore
        steve_project = await collection_project.mongoose_model.findByIdAndUpdate(steve_project._id, {
            $push: {
                steps: {
                    name: 'Fancy Step'
                }
            }
        }, {returnDocument: 'after'}).lean();
        let step_id = steve_project.steps[0]._id;

        let results = await got.delete(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}/steps/${step_id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_project.mongoose_model.findById(steve_project._id))), results.data);
        assert.equal((await collection_project.mongoose_model.findById(steve_project._id))?.steps.length, 0)
    });

    it(`should authorize a basic POST operation on a document's array children where the user has a T2 role membership`, async function () {
        let { edwin_institution, nathan_client, nathan_project } = await generate_test_setup();

        let results = await got.post(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/project/${nathan_project._id}/steps`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                name: 'Fancy Step'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_project.mongoose_model.findById(nathan_project._id))), results.data);
        assert.equal((await collection_project.mongoose_model.findById(nathan_project._id))?.steps.length, 1)
    });

    it(`should authorize a basic PUT operation on a document's array children where the user has a T2 role membership`, async function () {
        let { edwin_institution, nathan_client, nathan_project } = await generate_test_setup();

        //@ts-ignore
        nathan_project = await collection_project.mongoose_model.findByIdAndUpdate(nathan_project._id, {
            $push: {
                steps: {
                    name: 'Fancy Step'
                }
            }
        }, {returnDocument: 'after'}).lean();
        let step_id = nathan_project.steps[0]._id;

        let results = await got.put(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/project/${nathan_project._id}/steps/${step_id}`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                _id: step_id,
                name: 'Somber Step'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_project.mongoose_model.findById(nathan_project._id))), results.data);
        assert.equal((await collection_project.mongoose_model.findById(nathan_project._id))?.steps[0].name, 'Somber Step')
    });

    it(`should authorize a basic DELETE operation on a document's array children where the user has a T2 role membership`, async function () {
        let { edwin_institution, nathan_client, nathan_project } = await generate_test_setup();

        //@ts-ignore
        nathan_project = await collection_project.mongoose_model.findByIdAndUpdate(nathan_project._id, {
            $push: {
                steps: {
                    name: 'Fancy Step'
                }
            }
        }, {returnDocument: 'after'}).lean();
        let step_id = nathan_project.steps[0]._id;

        let results = await got.delete(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/project/${nathan_project._id}/steps/${step_id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_project.mongoose_model.findById(nathan_project._id))), results.data);
        assert.equal((await collection_project.mongoose_model.findById(nathan_project._id))?.steps.length, 0)
    });

    it(`should reject a basic POST operation on a document's array children where the user has a role membership without permission`, async function () {
        let { edwin_institution, edna_client, edna_project } = await generate_test_setup();

        await assert.rejects(async () => {
            let results = await got.post(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/project/${edna_project._id}/steps`, {
                headers: {
                    authorization: 'steve'
                },
                json: {
                    name: 'Fancy Step'
                }
            }).json();
        })
    });

    it(`should reject a basic PUT operation on a document's array children where the user has a role membership without permission`, async function () {
        let { edwin_institution, edna_client, edna_project } = await generate_test_setup();

        //@ts-ignore
        edna_project = await collection_project.mongoose_model.findByIdAndUpdate(edna_project._id, {
            $push: {
                steps: {
                    name: 'Fancy Step'
                }
            }
        }, {returnDocument: 'after'}).lean();
        let step_id = edna_project.steps[0]._id;

        await assert.rejects(async () => {
            let results = await got.put(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/project/${edna_project._id}/steps/${step_id}`, {
                headers: {
                    authorization: 'steve'
                },
                json: {
                    _id: step_id,
                    name: 'Somber Step'
                }
            }).json();
        })
    });

    it(`should reject a basic DELETE operation on a document's array children where the user has a role membership without permission`, async function () {
        let { edwin_institution, edna_client, edna_project } = await generate_test_setup();

        //@ts-ignore
        edna_project = await collection_project.mongoose_model.findByIdAndUpdate(edna_project._id, {
            $push: {
                steps: {
                    name: 'Fancy Step'
                }
            }
        }, {returnDocument: 'after'}).lean();
        let step_id = edna_project.steps[0]._id;

        await assert.rejects(async () => {
            let results = await got.delete(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/project/${edna_project._id}/steps/${step_id}`, {
                headers: {
                    authorization: 'steve'
                }
            }).json();
        })
    });

    it(`should reject a basic POST operation on a document's array children where the user has POST permission but not PUT permission`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        let user_barnabus = await collection_user.mongoose_model.create({
            auth_id: 'barnabus'
        });

        let access_role_steve_institution_grants_project_no_update = await collection_role.mongoose_model.create({
            name: 'steve full access',
            institution_id: steve_institution._id,
            permissions: {
                institutions: ['read', 'create', 'update', 'delete'],
                clients: ['read', 'create', 'update', 'delete'],
                projects: ['read', 'create', 'delete'],
                roles: ['read', 'create', 'update', 'delete'],
            }
        });

        let barnabus_institution_role_membership = await collection_institution_role_membership.mongoose_model.create({
            role_id: access_role_steve_institution_grants_project_no_update._id,
            user_id: user_barnabus._id,
            institution_id: steve_institution._id,
        })

        await assert.rejects(async () => {
            let results = await got.post(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}/steps`, {
                headers: {
                    authorization: 'barnabus'
                },
                json: {
                    name: 'Fancy Step'
                }
            }).json();
        })
    });

    it(`should reject a basic DELETE operation on a document's array children where the user has DELETE permission but not PUT permission`, async function () {
        let { steve_institution, steve_client, steve_project, steve_steve_institution_role_membership } = await generate_test_setup();

        let user_barnabus = await collection_user.mongoose_model.create({
            auth_id: 'barnabus'
        });

        let access_role_steve_institution_grants_project_no_update = await collection_role.mongoose_model.create({
            name: 'steve full access',
            institution_id: steve_institution._id,
            permissions: {
                institutions: ['read', 'create', 'update', 'delete'],
                clients: ['read', 'create', 'update', 'delete'],
                projects: ['read', 'create', 'delete'],
                roles: ['read', 'create', 'update', 'delete'],
            }
        });

        let barnabus_institution_role_membership = await collection_institution_role_membership.mongoose_model.create({
            role_id: access_role_steve_institution_grants_project_no_update._id,
            user_id: user_barnabus._id,
            institution_id: steve_institution._id,
        })

        let steve_new_access_role = await collection_role.mongoose_model.create({
            name: 'steve no project update',
            institution_id: steve_institution._id,
            permissions: {
                institutions: ['read', 'create', 'update', 'delete'],
                clients: ['read', 'create', 'update', 'delete'],
                projects: ['read', 'create', 'delete'],
                roles: ['read', 'create', 'update', 'delete'],
            }
        });

        await collection_client_role_membership.mongoose_model.findByIdAndUpdate(steve_steve_institution_role_membership._id, {
            role_id: steve_new_access_role._id
        })

        //@ts-ignore
        steve_project = await collection_project.mongoose_model.findByIdAndUpdate(steve_project._id, {
            $push: {
                steps: {
                    name: 'Fancy Step'
                }
            }
        }, {returnDocument: 'after'}).lean();
        let step_id = steve_project.steps[0]._id;

        await assert.rejects(async () => {
            let results = await got.delete(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}/steps/${step_id}`, {
                headers: {
                    authorization: 'barnabus'
                }
            }).json();
        })
    });


      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    TREE-NESTED CLIENTS        /////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should authorize a GET operation on a client nested under another client where the user has a T1 institution role membership`, async function () {
        let { steve_institution, steve_client } = await generate_test_setup();

        let nested_client = await collection_client.mongoose_model.create({
            institution_id: steve_institution._id,
            client_ids: [steve_client._id],
            name: 'nested client'
        });

        let results = await got.get(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/client/${nested_client._id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(nested_client)), results.data);
    });

    it(`should authorize a GET operation on a client nested several levels below an ancestor where the user has a T2 client role membership on that ancestor`, async function () {
        let { edwin_institution, nathan_client } = await generate_test_setup();

        let child_client = await collection_client.mongoose_model.create({ 
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        let grandchild_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id, child_client._id],
            name: 'grandchild client'
        });

        let great_grandchild_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id, child_client._id, grandchild_client._id],
            name: 'grandchild client'
        });

        // fetch the grandchild through the root ancestor, skipping the intermediate layer, to prove that
        // any ancestor covered by the role membership works, not just the direct parent.
        let results = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${grandchild_client._id}/client/${great_grandchild_client._id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(great_grandchild_client)), results.data);
    });

    it(`should reject a GET operation on a client nested under another client where the user has no role membership covering it`, async function () {
        let { steve_institution, steve_client } = await generate_test_setup();

        let nested_client = await collection_client.mongoose_model.create({
            institution_id: steve_institution._id,
            client_ids: [steve_client._id],
            name: 'nested client'
        });

        await assert.rejects(async () => {
            let results = await got.get(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/client/${nested_client._id}`, {
                headers: {
                    authorization: 'edwin'
                }
            }).json();
        })
    });

    it(`should not leak a client whose ancestor role membership does not actually belong to its tree`, async function () {
        let { edwin_institution, nathan_client, edna_client } = await generate_test_setup();

        // steve has a role membership on edna_client, but this client only descends from nathan_client
        let nested_under_nathan = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'nested under nathan'
        });

        let results = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/client/${nested_under_nathan._id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(null, results.data);
    });

    it(`should authorize a GET multiple operation returning every descendant of an ancestor client where the user has a T2 client role membership`, async function () {
        let { edwin_institution, nathan_client, edna_client } = await generate_test_setup();

        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        let grandchild_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id, child_client._id],
            name: 'grandchild client'
        });

        // not a descendant of nathan_client, and should not show up in the results
        await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [edna_client._id],
            name: 'unrelated client'
        });

        let results = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify([child_client, grandchild_client])), results.data);
    });

    it(`should authorize a POST operation nesting a client under an ancestor client where the user has a T2 client role membership`, async function () {
        let { edwin_institution, nathan_client } = await generate_test_setup();

        let results = await got.post(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                name: 'child client',
                institution_id: edwin_institution._id,
                client_ids: [nathan_client._id],
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_client.mongoose_model.findById(results.data._id))), results.data);
    });

    it(`should reject a POST operation nesting a client under an ancestor client where the role membership lacks create permission`, async function () {
        let { edwin_institution, edna_client } = await generate_test_setup();

        await assert.rejects(async () => {
            let results = await got.post(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/client`, {
                headers: {
                    authorization: 'steve'
                },
                json: {
                    name: 'child client',
                    institution_id: edwin_institution._id,
                    client_ids: [edna_client._id],
                }
            }).json();
        })
    });

    it(`should reject a POST operation nesting a client under an ancestor client it doesn't actually descend from`, async function () {
        let { edwin_institution, nathan_client, edna_client } = await generate_test_setup();

        await assert.rejects(async () => {
            let results = await got.post(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client`, {
                headers: {
                    authorization: 'steve'
                },
                json: {
                    name: 'child client',
                    institution_id: edwin_institution._id,
                    client_ids: [edna_client._id],
                }
            }).json();
        })
    });

    it(`should authorize a PUT operation on a client nested below an ancestor client where the user has a T2 client role membership`, async function () {
        let { edwin_institution, nathan_client } = await generate_test_setup();

        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        let results = await got.put(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client/${child_client._id}`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                name: 'renamed child client'
            }
        }).json();

        //@ts-ignore
        assert.notDeepEqual(JSON.parse(JSON.stringify(child_client)), results.data);
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_client.mongoose_model.findById(child_client._id))), results.data);
    });

    it(`should silently ignore an attempt to remove a client from the ancestor layer it's being accessed through, since client_ids is immutable via PUT`, async function () {
        let { edwin_institution, nathan_client } = await generate_test_setup();

        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        let results = await got.put(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client/${child_client._id}`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                name: 'renamed child client',
                client_ids: [],
            }
        }).json();

        //@ts-ignore
        assert.equal(results.data.name, 'renamed child client');
        //@ts-ignore
        assert.deepEqual((await collection_client.mongoose_model.findById(child_client._id))?.client_ids.map(String), [String(nathan_client._id)]);
    });

    it(`should authorize a DELETE operation on a client nested below an ancestor client where the user has a T2 client role membership`, async function () {
        let { edwin_institution, nathan_client } = await generate_test_setup();

        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        let results = await got.delete(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client/${child_client._id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(child_client)), results.data);
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_client.mongoose_model.findById(child_client._id))), undefined);
    });

    it(`should reject a DELETE operation on a client nested below an ancestor client where the role membership lacks delete permission`, async function () {
        let { edwin_institution, edna_client } = await generate_test_setup();

        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [edna_client._id],
            name: 'child client'
        });

        await assert.rejects(async () => {
            let results = await got.delete(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/client/${child_client._id}`, {
                headers: {
                    authorization: 'steve'
                }
            }).json();
        })
    });


      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    SECURITY: client_ids ANCESTOR INJECTION     /////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should silently ignore an attempt to graft an extra client_ids ancestor onto a document via PUT, since client_ids is immutable via PUT`, async function () {
        let { edwin_institution, nathan_client, edna_client } = await generate_test_setup();

        // child_client legitimately descends only from nathan_client, which steve fully controls
        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        // steve only has read access to edna_client -- attempting to graft child_client onto edna_client's
        // branch via PUT should be silently ignored rather than applied
        await got.put(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client/${child_client._id}`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                name: 'child client',
                client_ids: [nathan_client._id, edna_client._id],
            }
        }).json();

        //@ts-ignore
        assert.deepEqual((await collection_client.mongoose_model.findById(child_client._id))?.client_ids.map(String), [String(nathan_client._id)]);
    });

    it(`should not expose a document to an unrelated user's role membership just because another user planted that user's client in client_ids`, async function () {
        let { edwin_institution, nathan_client, edna_client, access_role_edwin_institution_grants_project } = await generate_test_setup();

        let user_barnabus = await collection_user.mongoose_model.create({
            auth_id: 'barnabus'
        });

        // barnabus has full CRUD on edna_client's branch only, and no relationship whatsoever to nathan_client
        await collection_client_role_membership.mongoose_model.create({
            role_id: access_role_edwin_institution_grants_project._id,
            user_id: user_barnabus._id,
            institution_id: edwin_institution._id,
            client_id: edna_client._id,
        });

        // child_client legitimately descends only from nathan_client, which barnabus has no access to
        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        // barnabus cannot see child_client yet
        let baseline = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/client/${child_client._id}`, {
            headers: {
                authorization: 'barnabus'
            }
        }).json();
        //@ts-ignore
        assert.deepEqual(null, baseline.data);

        // steve (who has full CRUD via nathan_client) plants edna_client into child_client's ancestor list
        await got.put(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client/${child_client._id}`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                name: 'child client',
                client_ids: [nathan_client._id, edna_client._id],
            }
        }).json();

        // barnabus should still not be able to reach a document he was never granted access to -- the planted
        // ancestor never actually took effect, so this returns a permission-granted-but-no-match empty result
        // rather than a 403, same as the baseline check above
        let after_injection = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/client/${child_client._id}`, {
            headers: {
                authorization: 'barnabus'
            }
        }).json();
        //@ts-ignore
        assert.deepEqual(null, after_injection.data);
    });

    it(`should not let a user retain access to a client after their role membership is revoked, by planting a self-controlled ancestor in client_ids beforehand`, async function () {
        let { edwin_institution, nathan_client, user_steve, access_role_edwin_institution_grants_project, steve_nathan_client_role_membership } = await generate_test_setup();

        // a client steve legitimately controls elsewhere in the same institution, unrelated to nathan_client
        let backdoor_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            name: 'backdoor client'
        });
        await collection_client_role_membership.mongoose_model.create({
            role_id: access_role_edwin_institution_grants_project._id,
            user_id: user_steve._id,
            institution_id: edwin_institution._id,
            client_id: backdoor_client._id,
        });

        // child_client legitimately descends only from nathan_client
        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        // steve plants his own backdoor_client into child_client's ancestor list while he still has
        // legitimate access via nathan_client
        await got.put(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client/${child_client._id}`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                name: 'child client',
                client_ids: [nathan_client._id, backdoor_client._id],
            }
        }).json();

        // the institution admin revokes steve's access to nathan_client entirely
        await collection_client_role_membership.mongoose_model.findByIdAndDelete(steve_nathan_client_role_membership._id);

        // steve should have lost all access to child_client -- the planted backdoor_client ancestor never
        // actually took effect, so this returns a permission-granted-but-no-match empty result rather than
        // exposing the document
        let after_revocation = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${backdoor_client._id}/client/${child_client._id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();
        //@ts-ignore
        assert.deepEqual(null, after_revocation.data);
    });

    it(`should reject a POST that creates a client under a legitimate ancestor while also grafting it onto an ancestor the user has no create permission over`, async function () {
        let { edwin_institution, nathan_client, edna_client } = await generate_test_setup();

        // steve has full CRUD via nathan_client, but only read access to edna_client -- he should not
        // be able to create a brand-new client that's simultaneously exposed under edna_client's branch
        await assert.rejects(async () => {
            await got.post(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client`, {
                headers: {
                    authorization: 'steve'
                },
                json: {
                    name: 'new client',
                    institution_id: edwin_institution._id,
                    client_ids: [nathan_client._id, edna_client._id],
                }
            }).json();
        });
    });
});
