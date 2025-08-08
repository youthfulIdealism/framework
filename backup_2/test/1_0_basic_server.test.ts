import assert from "assert";
import { z, ZodObject, ZodRawShape } from 'zod'
import got from 'got'

import { F_Collection } from '../../dist/F_Collection.js'
import { schema_from_zod, mongodb_id } from '../../dist/utils/mongoose_from_zod.js';
import { Mongoose, Schema } from 'mongoose'

import express, { Express, Request, Response, NextFunction } from 'express'
import mongoose from "mongoose";
import { Server } from "http";
import { Framework } from "../../dist/index.js";

function get_framework(){
   let framework = (new Framework())
        .add_collection('basic_collection', z.object({
            _id: mongodb_id(),
            name: z.string(),
            age: z.number(),
            is_todd: z.boolean(),
            date_deceased: z.coerce.date().optional()
        }));
    framework.set_auth_fetcher(async (req, res) => {
        return {
            is_super_admin: false,
            permissions: [],
            user_id: 'test'
        }
    })
    framework.set_api_url_prefix('/api');

    return framework;
}

describe('Basic server test', function () {
    const port = 4601;
    let express_app: Express;
    let server: Server;
    let db_connection: Mongoose; 
    let framework: ReturnType<typeof get_framework>;

    // before any tests run, set up the server and the db connection
    before(async function() {
        express_app = express();
        express_app.use(express.json());
        db_connection = await mongoose.connect('mongodb://localhost:27017/');
        framework = get_framework();
        framework.register(express_app, db_connection, {
            limit: 100
        });
    
        server = express_app.listen(port, ()=> {
            console.log(`test server listening on port ${port}`);
        });
    })

    after(async function (){
        await server.close();
        //await db_connection.connection.db?.dropDatabase();
        mongoose.connection.modelNames().forEach(ele => mongoose.connection.deleteModel(ele));
        db_connection.modelNames().forEach(ele => db_connection.deleteModel(ele));
        await db_connection.disconnect()
    });

    beforeEach(async function(){
        await framework.collections.basic_collection.mongoose_model.collection.drop();
    })

    it('should fetch based on an empty query', async function () {
        let created_person = JSON.parse(JSON.stringify(await framework.collections.basic_collection.mongoose_model.create({
            age: 29,
            is_todd: false,
            date_deceased: new Date(),
            name: 'grathel monblewheeze'
        })))

        let person_response = await got.get(`http://localhost:${port}/api/basic_collection`).json()
        assert.deepEqual([created_person], person_response)
    });

    it('should fetch based on ID', async function () {
        let created_person = JSON.parse(JSON.stringify(await framework.collections.basic_collection.mongoose_model.create({
            age: 29,
            is_todd: false,
            date_deceased: new Date(),
            name: 'grathel monblewheeze'
        })))

        let person_response = await got.get(`http://localhost:${port}/api/basic_collection/${created_person._id}`).json()
        assert.deepEqual(created_person, person_response)
    });

    it('should create a document', async function () {
        let person_response = await got.post(`http://localhost:${port}/api/basic_collection`, {
            json: {
                age: 29,
                is_todd: false,
                date_deceased: new Date(),
                name: 'grathel monblewheeze'
            }
        }).json()
        let db_people = JSON.parse(JSON.stringify(await framework.collections.basic_collection.mongoose_model.find({}).lean()));
        assert.deepEqual([person_response], db_people)
    });
});