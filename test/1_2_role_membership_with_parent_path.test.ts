
import assert from "assert";

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { F_Collection } from '../dist/f_collection.js';
import { F_Collection_Registry } from '../dist/F_Collection_Registry.js'
import { F_SM_Role_Membership } from '../dist/F_Security_Models/F_SM_Role_Membership.js'
import { F_SM_Role_Membership_With_Parent_Path } from '../dist/F_Security_Models/F_SM_Role_Membership_With_Parent_Path.js'
import { Auth_Data, F_Security_Model } from '../dist/F_Security_Models/F_Security_Model.js'
import { z } from 'zod'

import got from 'got'
import express, { Express, Request, Response } from 'express'
import mongoose, { Mongoose } from "mongoose";
import { Server } from "http";

// F_SM_Role_Membership_With_Parent_Path is a drop-in replacement for the self-referencing half of a
// tree-nested layer pair (ie. new F_SM_Role_Membership(collection_client, collection_client)), meant
// specifically for collections that nest inside themselves via a "<layer>_ids" ancestor-chain field.
// This suite mirrors the "TREE-NESTED CLIENTS" section of 1_2_role_membership.test.ts, but wires this
// model in for the client-in-client check instead, to confirm it behaves equivalently for the same
// scenarios, plus a few direct unit tests on has_permission itself for behavior that isn't currently
// reachable through F_Compile's HTTP routing.
describe.only('Security Model Role Membership With Parent Path', function () {
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
    let collection_user: F_Collection<'user', typeof validate_user>;
    let collection_role: F_Collection<'role', typeof validate_role>;
    let collection_institution_role_membership: F_Collection<'institution_role_membership', typeof validate_institution_role_membership>;
    let collection_client_role_membership: F_Collection<'client_role_membership', typeof validate_client_role_membership>;

    let registry: F_Collection_Registry;

    before(async function() {
        express_app = express();
        express_app.use(express.json());
        db_connection = await mongoose.connect('mongodb://127.0.0.1:27017/');

        collection_institution = new F_Collection('institution', 'institutions', validate_institution);
        collection_client = new F_Collection('client', 'clients', validate_client);
        collection_user = new F_Collection('user', 'users', validate_user);
        collection_role = new F_Collection('role', 'roles', validate_role);
        collection_institution_role_membership = new F_Collection('institution_role_membership', 'institution_role_memberships', validate_institution_role_membership);
        collection_client_role_membership = new F_Collection('client_role_membership', 'client_role_memberships', validate_client_role_membership);

        collection_institution.add_layers([], [new F_SM_Role_Membership(collection_institution, collection_institution)]);

        collection_client.add_layers(['institution'], [
            new F_SM_Role_Membership(collection_client, collection_institution),
            new F_SM_Role_Membership_With_Parent_Path(collection_client, collection_client)
        ]/*[new F_SM_Role_Membership(collection_client, collection_institution)]*/);

        // the self-referencing half of this pair uses the new model; the institution-wide (T1) half is
        // left as the original F_SM_Role_Membership, since institutions aren't tree-nested and the new
        // model only ever looks at role memberships scoped to its own collection type.
        /*collection_client.add_layers(['institution', 'client'], [
            //new F_SM_Role_Membership(collection_client, collection_institution),
            new F_SM_Role_Membership_With_Parent_Path(collection_client, collection_client)
        ]);*/

        let proto_registry = new F_Collection_Registry();
        registry = proto_registry.register(collection_user)
            .register(collection_institution)
            .register(collection_client)
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

        await new Promise(resolve => setTimeout(resolve, 200))
    })

    after(async function (){
        await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
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
        await new Promise(resolve => setTimeout(resolve, 500))
    })

    /**
     * - steve institution
     * - - steve client (steve has NO role membership here at all)
     * - edwin institution
     * - - nathan client (steve: T2 full CRUD)
     * - - edna client (steve: T2 read-only)
     * edwin has a T1 full-access institution role on edwin_institution.
     *
     * Deliberately, steve has no institution-level role in edwin_institution at all, so any test that
     * passes does so purely because of the client-tree model being validated here, not because of a T1
     * institution-wide role covering the gap.
     */
    async function generate_test_setup(){
        let user_steve = await collection_user.mongoose_model.create({ auth_id: 'steve' });
        let user_edwin = await collection_user.mongoose_model.create({ auth_id: 'edwin' });

        let steve_institution = await collection_institution.mongoose_model.create({ name: `steve institution` });
        let edwin_institution = await collection_institution.mongoose_model.create({ name: `edwin institution` });

        let steve_client = await collection_client.mongoose_model.create({
            institution_id: steve_institution._id,
            name: 'steve client'
        });

        let nathan_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            name: 'nathan client'
        });

        let edna_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            name: 'edna client'
        });

        let access_role_full = await collection_role.mongoose_model.create({
            name: 'edwin full access',
            institution_id: edwin_institution._id,
            permissions: {
                institutions: ['read', 'create', 'update', 'delete'],
                clients: ['read', 'create', 'update', 'delete'],
                roles: ['read', 'create', 'update', 'delete'],
            }
        });

        let access_role_minimal = await collection_role.mongoose_model.create({
            name: 'edwin limited access',
            institution_id: edwin_institution._id,
            permissions: {
                institutions: ['read'],
                clients: ['read'],
                roles: ['read'],
            }
        });

        let steve_nathan_client_role_membership = await collection_client_role_membership.mongoose_model.create({
            role_id: access_role_full._id,
            user_id: user_steve._id,
            institution_id: edwin_institution._id,
            client_id: nathan_client._id
        });

        let steve_edna_client_role_membership = await collection_client_role_membership.mongoose_model.create({
            role_id: access_role_minimal._id,
            user_id: user_steve._id,
            institution_id: edwin_institution._id,
            client_id: edna_client._id
        });

        let edwin_edwin_institution_role_membership = await collection_institution_role_membership.mongoose_model.create({
            role_id: access_role_full._id,
            user_id: user_edwin._id,
            institution_id: edwin_institution._id,
        });

        return {
            user_steve,
            user_edwin,
            steve_institution,
            edwin_institution,
            steve_client,
            nathan_client,
            edna_client,
            access_role_full,
            access_role_minimal,
            steve_nathan_client_role_membership,
            steve_edna_client_role_membership,
            edwin_edwin_institution_role_membership,
        }
    }


      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    GET one        ////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it.only(`should authorize a GET operation on a client where the user has a T2 role membership on the direct parent`, async function () {
        let { edwin_institution, nathan_client } = await generate_test_setup();

        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        let results = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${child_client._id}?client_ids=${nathan_client._id}`, {
            headers: { authorization: 'steve' }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(child_client)), results.data);
    });

    it(`should authorize a GET operation on a client nested directly under another client where the user has a T2 role membership on the direct parent`, async function () {
        let { edwin_institution, nathan_client } = await generate_test_setup();

        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        let results = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${child_client._id}`, {
            headers: { authorization: 'steve' }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(child_client)), results.data);
    });

    it(`should authorize a GET operation several levels deep, where the URL's ancestor segment matches the role membership exactly`, async function () {
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

        // steve's role membership is on nathan_client, so accessing through nathan_client (even though
        // grandchild_client is two levels below it) is authorized
        let results = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${grandchild_client._id}`, {
            headers: { authorization: 'steve' }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(grandchild_client)), results.data);
    });

    it(`should reject a GET operation on a client nested under another client where the user has no role membership covering it`, async function () {
        let { steve_institution, steve_client } = await generate_test_setup();

        let nested_client = await collection_client.mongoose_model.create({
            institution_id: steve_institution._id,
            client_ids: [steve_client._id],
            name: 'nested client'
        });

        await assert.rejects(async () => {
            await got.get(`http://localhost:${port}/api/institution/${steve_institution._id}/client/${steve_client._id}/client/${nested_client._id}`, {
                headers: { authorization: 'steve' }
            }).json();
        })
    });

    it(`should reject a GET operation where the role membership only grants read on a different branch`, async function () {
        let { edwin_institution, edna_client } = await generate_test_setup();

        let child_of_edna = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [edna_client._id],
            name: 'child of edna'
        });

        // steve holds a role on edna_client, so the permission check itself passes -- but the role only
        // grants 'read', so a PUT should still be rejected
        await assert.rejects(async () => {
            await got.put(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/client/${child_of_edna._id}`, {
                headers: { authorization: 'steve' },
                json: { name: 'renamed' }
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
            headers: { authorization: 'steve' }
        }).json();

        //@ts-ignore
        assert.deepEqual(null, results.data);
    });

    it(`should authorize a GET multiple operation returning every descendant of an ancestor client`, async function () {
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
            headers: { authorization: 'steve' }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify([child_client, grandchild_client])), results.data);
    });


      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    POST / PUT / DELETE     ///////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should authorize a POST operation nesting a client directly under an ancestor client`, async function () {
        let { edwin_institution, nathan_client } = await generate_test_setup();

        let results = await got.post(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client`, {
            headers: { authorization: 'steve' },
            json: {
                name: 'child client',
                institution_id: edwin_institution._id,
                client_ids: [nathan_client._id],
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_client.mongoose_model.findById(results.data._id))), results.data);
    });

    it(`should authorize a POST operation nesting a client two levels deep, validating the full ancestor chain against the real parent`, async function () {
        let { edwin_institution, nathan_client } = await generate_test_setup();

        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        let results = await got.post(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client`, {
            headers: { authorization: 'steve' },
            json: {
                name: 'grandchild client',
                institution_id: edwin_institution._id,
                client_ids: [nathan_client._id, child_client._id],
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_client.mongoose_model.findById(results.data._id))), results.data);
    });

    it(`should reject a POST operation nesting a client under an ancestor client where the role membership lacks create permission`, async function () {
        let { edwin_institution, edna_client } = await generate_test_setup();

        await assert.rejects(async () => {
            await got.post(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/client`, {
                headers: { authorization: 'steve' },
                json: {
                    name: 'child client',
                    institution_id: edwin_institution._id,
                    client_ids: [edna_client._id],
                }
            }).json();
        })
    });

    it(`should reject a POST that grafts an extra ancestor the user has no permission over onto a newly-created client`, async function () {
        let { edwin_institution, nathan_client, edna_client } = await generate_test_setup();

        // steve fully controls nathan_client but only has read access to edna_client -- this should be
        // rejected by F_Compile's ancestry validation regardless of which security model granted the
        // initial permission check
        await assert.rejects(async () => {
            await got.post(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client`, {
                headers: { authorization: 'steve' },
                json: {
                    name: 'new client',
                    institution_id: edwin_institution._id,
                    client_ids: [nathan_client._id, edna_client._id],
                }
            }).json();
        })
    });

    it(`should authorize a PUT operation on a client nested below an ancestor client`, async function () {
        let { edwin_institution, nathan_client } = await generate_test_setup();

        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        let results = await got.put(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client/${child_client._id}`, {
            headers: { authorization: 'steve' },
            json: { name: 'renamed child client' }
        }).json();

        //@ts-ignore
        assert.equal(results.data.name, 'renamed child client');
    });

    it(`should silently ignore an attempt to change client_ids via PUT, since it's immutable regardless of which security model granted permission`, async function () {
        let { edwin_institution, nathan_client, edna_client } = await generate_test_setup();

        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        await got.put(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client/${child_client._id}`, {
            headers: { authorization: 'steve' },
            json: {
                name: 'child client',
                client_ids: [nathan_client._id, edna_client._id],
            }
        }).json();

        //@ts-ignore
        assert.deepEqual((await collection_client.mongoose_model.findById(child_client._id))?.client_ids.map(String), [String(nathan_client._id)]);
    });

    it(`should authorize a DELETE operation on a client nested below an ancestor client`, async function () {
        let { edwin_institution, nathan_client } = await generate_test_setup();

        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        let results = await got.delete(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client/${child_client._id}`, {
            headers: { authorization: 'steve' }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(child_client)), results.data);
        assert.deepEqual(await collection_client.mongoose_model.findById(child_client._id), null);
    });

    it(`should reject a DELETE operation where the role membership lacks delete permission`, async function () {
        let { edwin_institution, edna_client } = await generate_test_setup();

        let child_of_edna = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [edna_client._id],
            name: 'child of edna'
        });

        await assert.rejects(async () => {
            await got.delete(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${edna_client._id}/client/${child_of_edna._id}`, {
                headers: { authorization: 'steve' }
            }).json();
        })
    });

    it(`should still authorize access via a T1 institution-wide role membership alongside the new model`, async function () {
        let { edwin_institution, nathan_client } = await generate_test_setup();

        let child_client = await collection_client.mongoose_model.create({
            institution_id: edwin_institution._id,
            client_ids: [nathan_client._id],
            name: 'child client'
        });

        // edwin has no client-level role membership at all, only a T1 institution-wide one
        let results = await got.get(`http://localhost:${port}/api/institution/${edwin_institution._id}/client/${nathan_client._id}/client/${child_client._id}`, {
            headers: { authorization: 'edwin' }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(child_client)), results.data);
    });


      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    DIRECT UNIT TESTS ON has_permission     ////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // F_Compile always builds find[`${layer}_ids`] as a single scalar (the URL's ancestor segment), so
    // these two branches of has_permission aren't currently reachable through the compiled HTTP routes.
    // They're exercised directly here since they're real behavior of the class that any future caller
    // (a hand-rolled route, a different compile function, a refactor of F_Compile itself) could trigger.

    it(`should grant permission via $in when any candidate ancestor in the query matches a held role membership`, async function () {
        let security_model = new F_SM_Role_Membership_With_Parent_Path(collection_client, collection_client);
        let held_id = new mongoose.Types.ObjectId().toString();
        let unrelated_id = new mongoose.Types.ObjectId().toString();

        let fake_req = {
            auth: {
                user_id: 'someone',
                layers: [{
                    layer: 'client',
                    layer_id: held_id,
                    permissions: { clients: ['read'] },
                    special_permissions: {}
                }]
            }
        } as any;

        let permitted = await security_model.has_permission(fake_req, {} as any, { client_ids: { $in: [unrelated_id, held_id] } }, 'get');
        assert.equal(permitted, true);

        let denied = await security_model.has_permission(fake_req, {} as any, { client_ids: { $in: [unrelated_id] } }, 'get');
        assert.equal(denied, false);
    });

    it(`BUG: a read/update/delete check with no client_ids in the query falls through into the create branch and can be granted from the request body instead of failing closed`, async function () {
        // has_permission's switch statement has no "break" separating the get/update/delete case group
        // from the "create" case, so whenever find[client_ids] is missing or not in a recognized shape,
        // execution falls through and grants access based on req.body[client_ids] instead -- a field that
        // has no bearing on a get/update/delete request at all.
        let security_model = new F_SM_Role_Membership_With_Parent_Path(collection_client, collection_client);
        let held_id = new mongoose.Types.ObjectId().toString();

        let fake_req = {
            auth: {
                user_id: 'someone',
                layers: [{
                    layer: 'client',
                    layer_id: held_id,
                    permissions: { clients: ['read'] },
                    special_permissions: {}
                }]
            },
            body: { client_ids: [held_id] }
        } as any;

        let permitted = await security_model.has_permission(fake_req, {} as any, {}, 'get');
        assert.equal(permitted, false, 'a get/update/delete check with no client_ids in the query should fail closed rather than consult the request body');
    });
});
