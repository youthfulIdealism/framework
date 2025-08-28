
import assert from "assert";

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { F_Collection } from '../dist/f_collection.js';
import { F_Collection_Registry } from '../dist/F_Collection_Registry.js'
import { F_SM_Open_Access } from '../dist/F_Security_Models/F_SM_Open_Access.js'
import { F_SM_Role_Membership } from '../dist/F_Security_Models/F_SM_Role_Membership.js'
import { F_Security_Model } from '../dist/F_Security_Models/F_Security_Model.js'
import { Cache } from '../dist/utils/cache.js'
import { z, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'

import got from 'got'
import express, { Express, Request, Response, NextFunction } from 'express'
import mongoose, { Mongoose } from "mongoose";
import { Server } from "http";

// IF YOU RUN THESE TESTS ON THEIR OWN, THEY WORK FINE
// there's something janky going on with the mongodb or express
// setup/teardown that's causing the mto fail.
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
        name: z.string(),
    });
    const validate_project = z.object({
        _id: z_mongodb_id,
        institution_id: z_mongodb_id,
        client_id: z_mongodb_id,
        name: z.string(),
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
            institution: z.array(z.enum(['read', 'create', 'update', 'delete'])),
            client: z.array(z.enum(['read', 'create', 'update', 'delete'])),
            project: z.array(z.enum(['read', 'create', 'update', 'delete'])),
            role: z.array(z.enum(['read', 'create', 'update', 'delete'])),
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

        collection_institution = new F_Collection('institution', validate_institution);
        collection_client = new F_Collection('client', validate_client);
        collection_project = new F_Collection('project', validate_project);
        collection_user = new F_Collection('user', validate_user);
        collection_role = new F_Collection('role', validate_role);
        collection_institution_role_membership = new F_Collection('institution_role_membership', validate_institution_role_membership);
        collection_client_role_membership = new F_Collection('client_role_membership', validate_client_role_membership);

        collection_institution.add_layers([], [new F_SM_Role_Membership(
            collection_institution, 
            collection_institution,
            collection_institution_role_membership,
            collection_role,
            cache_institution_role_membership,
            cache_role,
            'user_id',
            'role_id'
        )]);

        collection_client.add_layers(['institution'], [new F_SM_Role_Membership(
            collection_client, 
            collection_institution,
            collection_institution_role_membership,
            collection_role,
            cache_institution_role_membership,
            cache_role,
            'user_id',
            'role_id'
        )]);
        
        collection_project.add_layers(['institution', 'client'], [
            new F_SM_Role_Membership(
                collection_project, 
                collection_institution,
                collection_institution_role_membership,
                collection_role,
                cache_institution_role_membership,
                cache_role,
                'user_id',
                'role_id'
            ),
            new F_SM_Role_Membership(
                collection_project, 
                collection_client,
                collection_client_role_membership,
                collection_role,
                cache_client_role_membership,
                cache_role,
                'user_id',
                'role_id'
            )
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

            let user_record = await collection_user.mongoose_model.findOne({auth_id: req.headers.authorization})
            if(!user_record){ return undefined; }

            return { user_id: user_record._id, layers: [] };
        })
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
     * - - - steve project
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
            client_id: steve_client,
            name: 'steve project'
        })

        let joe_project = await collection_project.mongoose_model.create({
            institution_id: steve_institution._id,
            client_id: joe_client,
            name: 'joe project'
        })

        let nathan_project = await collection_project.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_id: nathan_client,
            name: 'nathan project'
        })

        let edna_project = await collection_project.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_id: edna_client,
            name: 'edna project'
        })

        let access_role_steve_institution_grants_project = await collection_role.mongoose_model.create({
            name: 'steve full access',
            institution_id: steve_institution._id,
            permissions: {
                institution: ['read', 'create', 'update', 'delete'],
                client: ['read', 'create', 'update', 'delete'],
                project: ['read', 'create', 'update', 'delete'],
                role: ['read', 'create', 'update', 'delete'],
            }
        });

        let access_role_steve_institution_grants_minimal = await collection_role.mongoose_model.create({
            name: 'steve limited access',
            institution_id: steve_institution._id,
            permissions: {
                institution: ['read'],
                client: ['read'],
                project: [],
                role: ['read'],
            }
        });

         let access_role_edwin_institution_grants_project = await collection_role.mongoose_model.create({
            name: 'edwin full access',
            institution_id: edwin_institution._id,
            permissions: {
                institution: ['read', 'create', 'update', 'delete'],
                client: ['read', 'create', 'update', 'delete'],
                project: ['read', 'create', 'update', 'delete'],
                role: ['read', 'create', 'update', 'delete'],
            }
        });

        let access_role_edwin_institution_grants_minimal = await collection_role.mongoose_model.create({
            name: 'edwin limited access',
            institution_id: edwin_institution._id,
            permissions: {
                institution: ['read'],
                client: ['read'],
                project: [],
                role: ['read'],
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
        console.log('HERE')

        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        console.log('PRECALL')

        let results = await got.get(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        console.log('POSTCALL')

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

        assert.rejects(async () => {
            let results = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/project/${edna_project._id}`, {
                headers: {
                    authorization: 'steve'
                }
            }).json();
        },
        { message: 'HTTPError: Response code 403 (Forbidden)' })
    });

    it(`should reject a basic GET operation on a document where the user has no role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        assert.rejects(async () => {
            let results = await got.get(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}`, {
                headers: {
                    authorization: 'edwin'
                }
            }).json();
        },
        { message: 'HTTPError: Response code 403 (Forbidden)' })
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
                client_id: steve_client,
                name: `additional project ${q}`
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
                client_id: nathan_client,
                name: `additional project ${q}`
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
                client_id: edna_client,
                name: `additional project ${q}`
            }))
        }

        assert.rejects(async () => {
            let results = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/project`, {
                headers: {
                    authorization: 'steve'
                }
            }).json();
        },
        { message: 'HTTPError: Response code 403 (Forbidden)' })
    });

    it(`should reject a basic GET multiple operation where the user has no role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        let projects = [steve_project];
        for(let q = 0; q < 5; q++){
            projects.push(await collection_project.mongoose_model.create({
                institution_id: steve_institution._id,
                client_id: steve_client,
                name: `additional project ${q}`
            }))
        }

        assert.rejects(async () => {
            let results = await got.get(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project`, {
                headers: {
                    authorization: 'edwin'
                }
            }).json();
        },
        { message: 'HTTPError: Response code 403 (Forbidden)' })
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

        assert.rejects(async () => {
            let results = await got.put(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/project/${edna_project._id}`, {
                headers: {
                    authorization: 'steve'
                },
                json: {
                    name: 'Flammable Project'
                }
            }).json();
        },
        { message: 'HTTPError: Response code 403 (Forbidden)' })
    });

    it(`should reject a basic PUT operation on a document where the user has no role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        assert.rejects(async () => {
            let results = await got.put(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}`, {
                headers: {
                    authorization: 'edwin'
                },
                json: {
                    name: 'Flammable Project'
                }
            }).json();
        },
        { message: 'HTTPError: Response code 403 (Forbidden)' })
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
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_project.mongoose_model.findById(results.data._id))), results.data);
    });

    it(`should reject a basic POST operation on a document where the user has a role membership without permission`, async function () {
        let { edwin_institution, edna_client, edna_project } = await generate_test_setup();

        assert.rejects(async () => {
            let results = await got.post(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/project`, {
                headers: {
                    authorization: 'steve'
                },
                json: {
                    name: 'Flammable Project',
                    institution_id: edwin_institution._id,
                    client_id: edna_client._id,
                }
            }).json();
        },
        { message: 'HTTPError: Response code 403 (Forbidden)' })
    });

    it(`should reject a basic POST operation on a document where the user has no role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        assert.rejects(async () => {
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
        },
        { message: 'HTTPError: Response code 403 (Forbidden)' })
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

        assert.rejects(async () => {
            let results = await got.delete(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/project/${edna_project._id}`, {
                headers: {
                    authorization: 'steve'
                }
            }).json();
        },
        { message: 'HTTPError: Response code 403 (Forbidden)' })
    });

    it(`should reject a basic DELETE operation on a document where the user has no role membership`, async function () {
        let { steve_institution, steve_client, steve_project } = await generate_test_setup();

        assert.rejects(async () => {
            let results = await got.delete(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/project/${steve_project._id}`, {
                headers: {
                    authorization: 'edwin'
                }
            }).json();
        },
        { message: 'HTTPError: Response code 403 (Forbidden)' })
    });
});
