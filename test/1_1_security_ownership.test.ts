
import assert from "assert";

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { F_Collection } from '../dist/f_collection.js';
import { F_Collection_Registry } from '../dist/F_Collection_Registry.js'
import { F_SM_Open_Access } from '../dist/F_Security_Models/F_SM_Open_Access.js'
import { F_SM_Ownership } from '../dist/F_Security_Models/F_SM_Ownership.js'
import { F_Security_Model } from '../dist/F_Security_Models/F_Security_Model.js'
import { z, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'

import got from 'got'
import express, { Express, Request, Response, NextFunction } from 'express'
import mongoose, { Mongoose } from "mongoose";
import { Server } from "http";



describe('Security Model Ownership', function () {
    const port = 4601;
    let express_app: Express;
    let server: Server;
    let db_connection: Mongoose;

    let validate_user = z.object({
        _id: z_mongodb_id,
        auth_id: z.string(),
    });
    let validate_user_display = z.object({
        _id: z_mongodb_id,
        user_id: z_mongodb_id,
        name: z.string(),
        email: z.string()
    })

    // set up schema: user
    let collection_user: F_Collection<'user', typeof validate_user>;

    // set up schema: user_display
    let collection_user_display: F_Collection<'user_display', typeof validate_user_display>;

    // build registry
    let registry: F_Collection_Registry;

    // before any tests run, set up the server and the db connection
    before(async function() {
        express_app = express();
        express_app.use(express.json());
        db_connection = await mongoose.connect('mongodb://127.0.0.1:27017/');

        collection_user = new F_Collection('user', 'users', validate_user);
        collection_user.add_layers([], [new F_SM_Open_Access(collection_user)]);

        collection_user_display = new F_Collection('user_display', 'user_displays', validate_user_display);
        collection_user_display.add_layers([], [new F_SM_Ownership(collection_user_display)]);

        let proto_registry = new F_Collection_Registry();
        registry = proto_registry.register(collection_user).register(collection_user_display);
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

        await db_connection.disconnect()

        await new Promise(resolve => setTimeout(resolve, 500))
    });

    beforeEach(async function(){
        for(let collection of Object.values(registry.collections)){
            //@ts-ignore
            await collection.mongoose_model.collection.drop();
        }
    })

    async function generate_user_and_display(){
        let user = await collection_user.mongoose_model.create({
            auth_id: 'steve'
        });

        let user_display = await collection_user_display.mongoose_model.create({
            user_id: user._id,
            name: 'steve',
            email: 'steve@example.com'
        })

        return { user, user_display}
    }

      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    GET one        ////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



    it(`should authorize a basic GET operation authenticated properly`, async function () {
        let { user, user_display } = await generate_user_and_display();

        let results = await got.get(`http://localhost:${port}/api/user_display/${user_display.id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(user_display)), results.data);
    });

    it(`should reject a basic GET operation authenticated to the wrong user`, async function () {
        let { user, user_display } = await generate_user_and_display();

        let user_2 = await collection_user.mongoose_model.create({
            auth_id: 'sharon'
        });

        assert.rejects(async () => {
            let results = await got.get(`http://localhost:${port}/api/user_display/${user_display.id}`, {
                headers: {
                    authorization: 'sharon'
                }
            }).json();
        }, {
            message: 'HTTPError: Response code 403 (Forbidden)'
        })
    });

      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    GET multiple        ///////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


    it(`should authorize a basic GET multiple operation authenticated properly`, async function () {
        let user = await collection_user.mongoose_model.create({
            auth_id: 'steve'
        });

        let user_displays = [] as any[];
        for(let q = 0; q < 5; q++){
            user_displays.push(await collection_user_display.mongoose_model.create({
                user_id: user._id,
                name: 'steve',
                email: 'steve@example.com'
            }))
        }

        let results = await got.get(`http://localhost:${port}/api/user_display?user_id=${user._id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(user_displays)), results.data);
    });

    it(`should reject a basic GET multiple operation when performed by the wrong user`, async function () {
        let user = await collection_user.mongoose_model.create({
            auth_id: 'steve'
        });

        let user_2 = await collection_user.mongoose_model.create({
            auth_id: 'sharon'
        });

        let user_displays = [] as any[];
        for(let q = 0; q < 5; q++){
            user_displays.push(await collection_user_display.mongoose_model.create({
                user_id: user._id,
                name: 'steve',
                email: 'steve@example.com'
            }))
        }
        
        //@ts-ignore
        assert.rejects(async () => {
            let results = await got.get(`http://localhost:${port}/api/user_display?user_id=${user._id}`, {
                headers: {
                    authorization: 'sharon'
                }
            }).json();
        }, {
            message: 'HTTPError: Response code 403 (Forbidden)'
        })
    });

      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    PUT        ////////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



    it(`should authorize a basic PUT operation authenticated properly`, async function () {
        let { user, user_display } = await generate_user_and_display();

        let results = await got.put(`http://localhost:${port}/api/user_display/${user_display.id}`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                email: 'steven@test.com'
            }
        }).json();

        //@ts-ignore
        assert.notDeepEqual(JSON.parse(JSON.stringify(user_display)), results.data);
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_user_display.mongoose_model.findById(user_display._id))), results.data);
    });

    it(`should reject a basic PUT operation authenticated to the wrong user`, async function () {
        let { user, user_display } = await generate_user_and_display();

        let user_2 = await collection_user.mongoose_model.create({
            auth_id: 'sharon'
        });

        assert.rejects(async () => {
            let results = await got.put(`http://localhost:${port}/api/user_display/${user_display.id}`, {
                headers: {
                    authorization: 'sharon'
                },
                json: {
                    email: 'steven@test.com'
                }
            }).json();
        }, {
            message: 'HTTPError: Response code 403 (Forbidden)'
        })
    });


      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    POST        ///////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    it(`should authorize a basic POST operation authenticated properly`, async function () {
        let { user, user_display } = await generate_user_and_display();

        let results = await got.post(`http://localhost:${port}/api/user_display`, {
            headers: {
                authorization: 'steve'
            },
            json: {
                user_id: user._id,
                name: 'grogfurd',
                email: 'grogfurd@example.com'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_user_display.mongoose_model.findById(results.data._id))), results.data);
    });

    it(`should reject a basic POST operation authenticated to the wrong user`, async function () {
        let { user, user_display } = await generate_user_and_display();

        let user_2 = await collection_user.mongoose_model.create({
            auth_id: 'sharon'
        });

        assert.rejects(async () => {
            let results = await got.post(`http://localhost:${port}/api/user_display`, {
                headers: {
                    authorization: 'sharon'
                },
                json: {
                    user_id: user._id,
                    name: 'grogfurd',
                    email: 'grogfurd@example.com'
                }
            }).json();
        }, {
            message: 'HTTPError: Response code 403 (Forbidden)'
        })
    });

      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
     /////////////////////////////////////////////////////////////    DELETE        /////////////////////////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



    it(`should authorize a basic DELETE operation authenticated properly`, async function () {
        let { user, user_display } = await generate_user_and_display();

        let results = await got.delete(`http://localhost:${port}/api/user_display/${user_display.id}`, {
            headers: {
                authorization: 'steve'
            }
        }).json();

        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(user_display)), results.data);
        //@ts-ignore
        assert.deepEqual(JSON.parse(JSON.stringify(await collection_user_display.mongoose_model.findById(user_display._id))), undefined);
    });

    it(`should reject a basic DELETE operation authenticated to the wrong user`, async function () {
        let { user, user_display } = await generate_user_and_display();

        let user_2 = await collection_user.mongoose_model.create({
            auth_id: 'sharon'
        });

        assert.rejects(async () => {
            let results = await got.delete(`http://localhost:${port}/api/user_display/${user_display.id}`, {
                headers: {
                    authorization: 'sharon'
                }
            }).json();
        }, {
            message: 'HTTPError: Response code 403 (Forbidden)'
        })
    });
});
