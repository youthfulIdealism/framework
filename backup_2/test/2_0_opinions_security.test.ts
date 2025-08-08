import assert from "assert";
import { z, ZodObject, ZodRawShape } from 'zod'
import got from 'got'

import { Framework } from '../../dist/index.js'
import { F_Collection } from '../../dist/F_Collection.js'
import { extend_role, get_permission_object } from '../../dist/opinions/standard_role.js'
import { extend_organizational_layer } from '../../dist/opinions/standard_organization_layer.js'
import { extend_role_membership } from '../../dist/opinions/standard_role_membership.js'
import { schema_from_zod, mongodb_id } from '../../dist/utils/mongoose_from_zod.js';
import { Mongoose, Schema } from 'mongoose'

import express, { Express, Request, Response, NextFunction } from 'express'
import mongoose from "mongoose";
import { Server } from "http";

function get_framework(){
    let framework = (new Framework())
        .add_organizational_layer('institution', z.object({
            _id: mongodb_id(),
            name: z.string(),
        }), z.object({}))
        .add_organizational_layer('client', z.object({
            _id: mongodb_id(),
            name: z.string(),
        }), z.object({}))
        .add_collection('basic_collection', z.object({
            _id: mongodb_id(),
            institution_id: mongodb_id(),
            client_id: mongodb_id(),
            name: z.string(),
            age: z.number(),
            is_todd: z.boolean(),
            date_deceased: z.coerce.date().optional()
        }))
        //.add_role_collection(z.object({ name: z.string() }))
        .add_auth_context_fetcher('roles', async (organization_layers, auth_data) => {
            let institution_id = organization_layers.institution;
            let client_id = organization_layers.client;
            let user_id = auth_data.user_id;

            let institution_role_membership = await framework.collections.institution_role_membership.mongoose_model.findOne({
                user_id: user_id,
                institution_id: institution_id
            }).lean();

            let client_role_membership = await framework.collections.institution_role_membership.mongoose_model.findOne({
                user_id: user_id,
                client_id: client_id
            }).lean();

            return {
                institution: institution_role_membership,
                client: client_role_membership,
            }
        });

    framework.set_auth_fetcher(async (req, res) => {
        return {
            user_id: 'edwin',
            is_super_admin: false,
            permissions: []
        }
    });

    framework

    framework.add_security_layer('basic_collection', ['roles'], (auth_data, organization_layers, auth_context, db_query) => {
        let institution_id = organization_layers.institution;
        let client_id = organization_layers.client;
        let user_id = auth_data.user_id;
        let is_super_admin = auth_data.is_super_admin;


        if(is_super_admin){
            return {
                allow_through: false,
                db_query: db_query
            }
        }


        

        return {
            allow_through: false,
            db_query: db_query
        }
    })

    return framework;
}

describe('Opinions Security Test', async function () {
    const port = 4601;
    let express_app: Express;
    let server: Server;
    let db_connection: Mongoose;

    let framework: ReturnType<typeof get_framework>;
    let institution_id: string;
    let client_id: string;

    // before any tests run, set up the server and the db connection
    before(async function() {
        express_app = express();
        express_app.use(express.json());
        db_connection = await mongoose.connect('mongodb://localhost:27017/');
        framework = get_framework();
        
        
    
        server = express_app.listen(port, ()=> {
            console.log(`test server listening on port ${port}`);
        });
    })

    after(async function (){
        await server.close();
        await db_connection.connection.db?.dropDatabase();
        db_connection.modelNames().forEach(ele => db_connection.deleteModel(ele));
        await db_connection.disconnect()
    });

    beforeEach(async function(){
        await db_connection.connection.db?.dropDatabase();

        institution_id = (await framework.collections.institution.mongoose_model.create({
            name: 'test_institution'
        }))._id + '';

        client_id = (await framework.collections.client.mongoose_model.create({
            name: 'test_client'
        }))._id + '';
    })



    /*
    it('should fetch based on an empty query', async function () {
        let created_person = JSON.parse(JSON.stringify(await basic_collection.mongoose_model.create({
            age: 29,
            is_todd: false,
            date_deceased: new Date(),
            name: 'grathel monblewheeze'
        })))

        let person_response = await got.get(`http://localhost:${port}/api/institution_id/client_id/basic_collection`).json()
        assert.deepEqual([created_person], person_response)
    });

    it('should fetch based on ID', async function () {
        let created_person = JSON.parse(JSON.stringify(await basic_collection.mongoose_model.create({
            age: 29,
            is_todd: false,
            date_deceased: new Date(),
            name: 'grathel monblewheeze'
        })))

        let person_response = await got.get(`http://localhost:${port}/api/institution_id/client_id/basic_collection/${created_person._id}`).json()
        assert.deepEqual(created_person, person_response)
    });

    it('should create a document', async function () {
        let person_response = await got.post(`http://localhost:${port}/api/institution_id/client_id/basic_collection`, {
            json: {
                age: 29,
                is_todd: false,
                date_deceased: new Date(),
                name: 'grathel monblewheeze'
            }
        }).json()
        let db_people = JSON.parse(JSON.stringify(await basic_collection.mongoose_model.find({}).lean()));
        assert.deepEqual([person_response], db_people)
    });*/
});