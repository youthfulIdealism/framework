
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

describe('Basic server with a z.or() field', function () {
    const port = 4601;
    let express_app: Express;
    let server: Server;
    let db_connection: Mongoose;

    // channel_data is a discriminated-ish union built with .or(): a "client" channel carries
    // client_id/client_ids, a "campaign" channel carries market_id/campaign_id/client_ids, and
    // a legacy channel is represented by a bare string instead of an object at all.
    const validate_channel = z.object({
        _id: z_mongodb_id,
        channel_data: z.object({
            chat_type: z.enum(['client']),
            client_ids: z.array(z_mongodb_id),
            client_id: z_mongodb_id
        }).or(z.object({
            chat_type: z.enum(['campaign']),
            client_ids: z.array(z_mongodb_id),
            market_id: z_mongodb_id,
            campaign_id: z_mongodb_id,
        }))
    });

    let channel: F_Collection<'channel', typeof validate_channel>;

    let registry: F_Collection_Registry;


    // before any tests run, set up the server and the db connection
    before(async function() {
        this.timeout(10000)
        express_app = express();
        express_app.use(express.json());
        db_connection = await mongoose.connect('mongodb://127.0.0.1:27017/');

        // if we define these in mocha's describe() function, it runs before connecting to the database.
        // this causes the mongoose definitions to get attached to a database instance that is closed at
        // the end of the previous test, spawning a MongoNotConnectedError error.
        channel = new F_Collection('channel', 'channels', validate_channel);
        channel.add_layers([], [new F_SM_Open_Access(channel)]);

        // build registry
        let proto_registry = new F_Collection_Registry();
        registry = proto_registry.register(channel);
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

        await db_connection.disconnect()

        await new Promise(resolve => setTimeout(resolve, 500))
    });

    beforeEach(async function(){
        for(let collection of Object.values(registry.collections)){
            //@ts-ignore
            await collection.mongoose_model.collection.drop();
        }
    })

    it(`should convert mongoDB IDs nested inside a z.or() branch to real ObjectIds when created through the API`, async function () {
        let client_id = new mongoose.Types.ObjectId().toString();
        let other_client_id = new mongoose.Types.ObjectId().toString();

        let results = await got.post(`http://localhost:${port}/api/channel`, {
            json: {
                channel_data: {
                    chat_type: 'client',
                    client_ids: [client_id, other_client_id],
                    client_id: client_id,
                }
            },
        }).json();

        //@ts-ignore
        let stored = await channel.mongoose_model.findById(results.data._id);

        let channel_data = stored?.channel_data as any;
        assert.ok(channel_data.client_id instanceof mongoose.Types.ObjectId,
            `expected channel_data.client_id to be converted to a mongoose ObjectId, but got ${channel_data.client_id} (${typeof channel_data.client_id})`);
        assert.ok(channel_data.client_ids.every((id: any) => id instanceof mongoose.Types.ObjectId),
            `expected every entry in channel_data.client_ids to be converted to a mongoose ObjectId, but got ${JSON.stringify(channel_data.client_ids)}`);
    });

    it(`should convert mongoDB IDs nested inside the other z.or() branch to real ObjectIds when created through the API`, async function () {
        let client_id = new mongoose.Types.ObjectId().toString();
        let market_id = new mongoose.Types.ObjectId().toString();
        let campaign_id = new mongoose.Types.ObjectId().toString();

        let results = await got.post(`http://localhost:${port}/api/channel`, {
            json: {
                channel_data: {
                    chat_type: 'campaign',
                    client_ids: [client_id],
                    market_id: market_id,
                    campaign_id: campaign_id,
                }
            },
        }).json();

        //@ts-ignore
        let stored = await channel.mongoose_model.findById(results.data._id);

        let channel_data = stored?.channel_data as any;
        assert.ok(channel_data.market_id instanceof mongoose.Types.ObjectId,
            `expected channel_data.market_id to be converted to a mongoose ObjectId, but got ${channel_data.market_id} (${typeof channel_data.market_id})`);
        assert.ok(channel_data.campaign_id instanceof mongoose.Types.ObjectId,
            `expected channel_data.campaign_id to be converted to a mongoose ObjectId, but got ${channel_data.campaign_id} (${typeof channel_data.campaign_id})`);
        assert.ok(channel_data.client_ids.every((id: any) => id instanceof mongoose.Types.ObjectId),
            `expected every entry in channel_data.client_ids to be converted to a mongoose ObjectId, but got ${JSON.stringify(channel_data.client_ids)}`);
    });

    it(`should convert mongoDB IDs nested inside a z.or() branch to real ObjectIds when created directly via mongoose`, async function () {
        let client_id = new mongoose.Types.ObjectId().toString();

        let created = await channel.mongoose_model.create({
            channel_data: {
                chat_type: 'client',
                client_ids: [client_id],
                client_id: client_id,
            }
        });

        //@ts-ignore
        let stored = await channel.mongoose_model.findById(created._id);

        let channel_data = stored?.channel_data as any;
        assert.ok(channel_data.client_id instanceof mongoose.Types.ObjectId,
            `expected channel_data.client_id to be converted to a mongoose ObjectId, but got ${channel_data.client_id} (${typeof channel_data.client_id})`);
    });

    it(`should still convert mongoDB IDs nested inside an object z.or() branch when a sibling branch is a bare z.string()`, async function () {
        let client_id = new mongoose.Types.ObjectId().toString();
        let market_id = new mongoose.Types.ObjectId().toString();
        let campaign_id = new mongoose.Types.ObjectId().toString();

        let created = await channel.mongoose_model.create({
            channel_data: {
                chat_type: 'campaign',
                client_ids: [client_id],
                market_id: market_id,
                campaign_id: campaign_id,
            }
        });

        //@ts-ignore
        let stored = await channel.mongoose_model.findById(created._id);

        let channel_data = stored?.channel_data as any;
        assert.ok(channel_data.market_id instanceof mongoose.Types.ObjectId,
            `expected channel_data.market_id to be converted to a mongoose ObjectId even with a sibling z.string() branch, but got ${channel_data.market_id} (${typeof channel_data.market_id})`);
        assert.ok(channel_data.campaign_id instanceof mongoose.Types.ObjectId,
            `expected channel_data.campaign_id to be converted to a mongoose ObjectId even with a sibling z.string() branch, but got ${channel_data.campaign_id} (${typeof channel_data.campaign_id})`);
    });

});
