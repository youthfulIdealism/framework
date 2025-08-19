
import assert from "assert";

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { F_Collection } from '../dist/f_collection.js';
import { F_Collection_Registry } from '../dist/F_Collection_Registry.js'
import { F_SM_Open_Access } from '../dist/F_Security_Models/F_SM_Open_Access.js'

import { z, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'
import { OpenApiBuilder } from "openapi3-ts/oas30";


describe('OpenAPI', function () {

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
        collection_institution = new F_Collection('institution', validate_institution);
        collection_client = new F_Collection('client', validate_client);
        collection_project = new F_Collection('project', validate_project);
        collection_user = new F_Collection('user', validate_user);
        collection_role = new F_Collection('role', validate_role);
        collection_institution_role_membership = new F_Collection('institution_role_membership', validate_institution_role_membership);
        collection_client_role_membership = new F_Collection('client_role_membership', validate_client_role_membership);

        collection_institution.add_layers([], [new F_SM_Open_Access(collection_institution)]);

        collection_client.add_layers(['institution'], [new F_SM_Open_Access(collection_client)]);
        
        collection_project.add_layers(['institution', 'client'], [new F_SM_Open_Access(collection_project)]);

        let proto_registry = new F_Collection_Registry();
        registry = proto_registry.register(collection_user)
            .register(collection_institution)
            .register(collection_client)
            .register(collection_project)
            .register(collection_user)
            .register(collection_role)
            .register(collection_institution_role_membership)
            .register(collection_client_role_membership);

        registry.to_openapi('/api');
    })

    after(async function (){
    });

    beforeEach(async function(){
    })

    it(`should render to an openAPI doc`, async function () {
        let builder = OpenApiBuilder.create();

        console.log(JSON.parse(JSON.stringify(registry.to_openapi('/api'))))
    });
});
