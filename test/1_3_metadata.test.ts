
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
import { F_Security_Model } from "../dist/F_Security_Models/F_Security_Model.js";

/*mongoose.connection.on('connected', () => console.log('connected'));
mongoose.connection.on('open', () => console.log('open'));
mongoose.connection.on('disconnected', () => console.log('disconnected'));
mongoose.connection.on('reconnected', () => console.log('reconnected'));
mongoose.connection.on('disconnecting', () => console.log('disconnecting'));
mongoose.connection.on('close', () => console.log('close'));*/

describe('Metadata Collection', function () {
    const port = 4601;
    let express_app: Express;
    let server: Server;
    let db_connection: Mongoose;

    const validate_institution = z.object({
        _id: z_mongodb_id,
        name: z.string(),
        created_at: z.coerce.date(),
        updated_at: z.coerce.date(),
        created_by: z.string(),
        updated_by: z.string(),
    });

    let collection_institution: F_Collection<'institution', typeof validate_institution>;

    let registry: F_Collection_Registry;
    

    // before any tests run, set up the server and the db connection
    before(async function() {
        express_app = express();
        express_app.use(express.json());
        db_connection = await mongoose.connect('mongodb://127.0.0.1:27017/');

        // if we define these in mocha's describe() function, it runs before connecting to the database.
        // this causes the mongoose definitions to get attached to a database instance that is closed at
        // the end of the previous test, spawning a MongoNotConnectedError error.
        collection_institution = new F_Collection('institution', 'institutions', validate_institution);
        let open_access_with_auth = new F_SM_Open_Access(collection_institution);
        open_access_with_auth.needs_auth_user = true;
        collection_institution.add_layers([], [open_access_with_auth]);

        // build registry
        let proto_registry = new F_Collection_Registry();
        registry = proto_registry.register(collection_institution);
        registry.compile(express_app, '/api');

        server = express_app.listen(port);

        F_Security_Model.set_auth_fetcher(async (req: Request) => { return { user_id:'todd', layers: [] };})

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


    it(`when performing a POST operation, created_at, updated_at, created_by, and updated_by should be added automatically`, async function () {
        let results = await got.post(`http://localhost:${port}/api/institution`, {
            json: {
                name: 'Spandex Co'
            }
        }).json();
        
        //@ts-ignore
        assert.equal(typeof results.data.created_at, 'string')
        //@ts-ignore
        assert.equal(typeof results.data.updated_at, 'string')
        //@ts-ignore
        assert.equal(typeof results.data.created_by, 'string')
        //@ts-ignore
        assert.equal(typeof results.data.updated_by, 'string')
    });

    it(`when performing a PUT operation, updated_at and updated_by should be updated automatically`, async function () {
        let sample_institution = await collection_institution.mongoose_model.create({
            name: `Burlington Duck Factory`,
            created_at: new Date('2000-01-01'),
            updated_at: new Date('2000-01-01'),
            created_by: 'janet',
            updated_by: 'janet',
        });

        let results = await got.put(`http://localhost:${port}/api/institution/${sample_institution._id}`, {
            json: {
                name: 'Burlington Soup Factory'
            }
        }).json();
        //@ts-ignore
        if(new Date(results.updated_at) < new Date(new Date().getTime() - 4000)){
            assert.fail('did not update updated_at');
        }
        //@ts-ignore
        assert.equal(results.data.updated_by, 'todd')
    });

    it(`when performing a PUT operation, should silently discard attempts to overwrite created_by and created_at`, async function () {
        let sample_institution = await collection_institution.mongoose_model.create({
            name: `Burlington Duck Factory`,
            created_at: new Date('2000-01-01'),
            updated_at: new Date('2000-01-01'),
            created_by: 'janet',
            updated_by: 'janet',
        });

        let results = await got.put(`http://localhost:${port}/api/institution/${sample_institution._id}`, {
            json: {
                name: 'Burlington Soup Factory',
                created_at: new Date(),
                created_by: 'todd'
            }
        }).json();
        //@ts-ignore
        assert.equal(results.data.created_at, new Date('2000-01-01').toISOString());
        //@ts-ignore
        assert.equal(results.data.created_by, 'janet');
    });
});
