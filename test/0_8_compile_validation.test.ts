
import assert from "assert";
import { z } from 'zod'
import express from 'express'
import mongoose from 'mongoose'

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { F_Collection } from '../dist/f_collection.js';
import { F_Collection_Registry } from '../dist/F_Collection_Registry.js'
import { compile } from '../dist/F_Compile.js'
import { F_Security_Model } from '../dist/F_Security_Models/F_Security_Model.js'
import { F_SM_Open_Access } from '../dist/F_Security_Models/F_SM_Open_Access.js'

describe('F_Collection construction and F_Compile validation', function () {

    afterEach(function () {
        mongoose.connection.modelNames().forEach(ele => mongoose.connection.deleteModel(ele));
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // F_Collection constructor validation
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should throw if the validator has no _id field`, function () {
        const validate_no_id = z.object({
            name: z.string(),
        });

        assert.throws(() => {
            //@ts-ignore
            new F_Collection('no_id', 'no_ids', validate_no_id);
        }, /_id is a required field/);
    });

    it(`should throw if _id is not a z_mongodb_id`, function () {
        const validate_bad_id = z.object({
            _id: z.string(),
            name: z.string(),
        });

        assert.throws(() => {
            //@ts-ignore
            new F_Collection('bad_id', 'bad_ids', validate_bad_id);
        }, /_id must be a mongoDB ID/);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // F_Compile layer-shape validation
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should throw when compiling a collection that is a member of its own layer without a "*_ids" field`, function () {
        const validate_client = z.object({
            _id: z_mongodb_id,
            name: z.string(),
        });

        let client = new F_Collection('client', 'clients', validate_client);
        // a collection can only nest inside itself if it exposes a "<collection_id>_ids" array field
        client.add_layers(['client'], [new F_SM_Open_Access(client)]);

        let registry = new F_Collection_Registry().register(client);

        assert.throws(() => {
            compile(express.Router(), client, '/api', registry);
        }, /cannot be a member of it's own layer/);
    });

    it(`should throw when compiling a collection whose layer is not present in the registry`, function () {
        const validate_project = z.object({
            _id: z_mongodb_id,
            institution_id: z_mongodb_id,
            name: z.string(),
        });

        let project = new F_Collection('project', 'projects', validate_project);
        project.add_layers(['institution'], [new F_SM_Open_Access(project)]);

        // deliberately not registering an "institution" collection
        let registry = new F_Collection_Registry().register(project);

        assert.throws(() => {
            compile(express.Router(), project, '/api', registry);
        }, /does not have a collection with the ID "institution"/);
    });

    it(`should throw when a layer's "*_id" field is not a mongodb ID`, function () {
        const validate_institution = z.object({
            _id: z_mongodb_id,
            name: z.string(),
        });
        const validate_project = z.object({
            _id: z_mongodb_id,
            institution_id: z.string(),
            name: z.string(),
        });

        let institution = new F_Collection('institution', 'institutions', validate_institution);
        let project = new F_Collection('project', 'projects', validate_project);
        project.add_layers(['institution'], [new F_SM_Open_Access(project)]);

        let registry = new F_Collection_Registry().register(institution).register(project);

        assert.throws(() => {
            compile(express.Router(), project, '/api', registry);
        }, /institution_id must be a mongodb ID/);
    });

    it(`should throw when a layer's "*_ids" field is not an array of mongodb IDs`, function () {
        const validate_institution = z.object({
            _id: z_mongodb_id,
            name: z.string(),
        });
        const validate_client = z.object({
            _id: z_mongodb_id,
            institution_id: z_mongodb_id,
            client_ids: z.array(z.string()),
            name: z.string(),
        });

        let institution = new F_Collection('institution', 'institutions', validate_institution);
        let client = new F_Collection('client', 'clients', validate_client);
        client.add_layers(['institution', 'client'], [new F_SM_Open_Access(client)]);

        let registry = new F_Collection_Registry().register(institution).register(client);

        assert.throws(() => {
            compile(express.Router(), client, '/api', registry);
        }, /client_ids must be an array of mongodb ID/);
    });

    it(`should throw when a layer has neither a "*_id" nor a "*_ids" field`, function () {
        const validate_institution = z.object({
            _id: z_mongodb_id,
            name: z.string(),
        });
        const validate_project = z.object({
            _id: z_mongodb_id,
            name: z.string(),
        });

        let institution = new F_Collection('institution', 'institutions', validate_institution);
        let project = new F_Collection('project', 'projects', validate_project);
        project.add_layers(['institution'], [new F_SM_Open_Access(project)]);

        let registry = new F_Collection_Registry().register(institution).register(project);

        assert.throws(() => {
            compile(express.Router(), project, '/api', registry);
        }, /institution_id must be a mongodb ID/);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // F_Collection_Registry registration behavior
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should throw an error when registering a collection with a given ID twice`, function () {
        const validate_v1 = z.object({
            _id: z_mongodb_id,
            name: z.string(),
        });
        const validate_v2 = z.object({
            _id: z_mongodb_id,
            title: z.string(),
        });

        let collection_v1 = new F_Collection('thing', 'things', validate_v1);
        // F_Collection registers a mongoose model as a side effect; delete it first so constructing a
        // second collection under the same collection_id doesn't hit mongoose's OverwriteModelError.
        mongoose.connection.deleteModel('thing');
        let collection_v2 = new F_Collection('thing', 'things', validate_v2);
        assert.throws(() => {
            let registry = new F_Collection_Registry().register(collection_v1).register(collection_v2);
        }, /Collection thing has already been registered./);
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // F_Security_Model deprecated static wrapper
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`the deprecated static has_permission wrapper should delegate to model_with_permission`, async function () {
        const validate_thing = z.object({
            _id: z_mongodb_id,
        });
        let collection_thing = new F_Collection('deprecated_thing', 'deprecated_things', validate_thing);
        let model = new F_SM_Open_Access(collection_thing);

        //@ts-ignore
        let result = await F_Security_Model.has_permission([model], {} as any, {} as any, {}, 'get');
        assert.equal(result, model);
    });
});
