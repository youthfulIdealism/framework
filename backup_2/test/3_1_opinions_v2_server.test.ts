import assert from "assert";
import { z, ZodObject, ZodRawShape } from 'zod'
import got from 'got'


import { schema_from_zod, mongodb_id } from '../../dist/utils/mongoose_from_zod.js';
import { Mongoose, Schema } from 'mongoose'

import express, { Express, Request, Response, NextFunction } from 'express'
import mongoose from "mongoose";
import { Server } from "http";
import { Framework_2 } from "../../dist/version_2/framework_2.js";
import { F_Collection_2 } from "../../dist/version_2/F_Collection_2.js";
import { Permission_Context } from "../../dist/version_2/permission_manager.js";

function get_framework(){

    /*basic_collection.add_permission_manager((context) => {
        return {
            allow: true,
            block: false,
            query: context.query
        }
    })*/

    let framework = new Framework_2().add_organizational_layer('institution', {
        _id: mongodb_id(),
        name: z.string()
    }).add_collection_in_layers('role', {
        _id: mongodb_id(),
        name: z.string(),
        permissions: z.object({
            'client': z.array(z.enum(['read', 'create', 'update', 'delete'])),
            'project': z.array(z.enum(['read', 'create', 'update', 'delete'])),
            'project_generator': z.array(z.enum(['read', 'create', 'update', 'delete'])),
            'role_membership': z.array(z.enum(['read', 'create', 'update', 'delete'])),
            'client_role_membership': z.array(z.enum(['read', 'create', 'update', 'delete'])),
        })
    }).add_collection_in_layers('role_membership', {
        _id: mongodb_id(),
        user_id: mongodb_id(),
        role_id: mongodb_id(),
        active: z.boolean(),
    }).add_organizational_layer('client', {
        _id: mongodb_id(),
        name: z.string(),
        project_manager_id: mongodb_id().optional(),
        current_numeral_id_index: z.number(),
        client_administrator_id: mongodb_id().optional(),
        google_drive_root_folder_id: z.string().optional(),
        google_drive_brief_folder_id: z.string().optional(),
        google_drive_content_folder_id: z.string().optional(),
    }).add_collection_in_layers('client_role_membership', {
        _id: mongodb_id(),
        user_id: mongodb_id(),
        role_id: mongodb_id(),
        active: z.boolean(),
    }).add_collection_in_layers('project', {
        _id: mongodb_id(),
        members: z.array(mongodb_id()),
        name: z.string(),
        project_manager: z.string(),
        ui_id: z.number(),
    }).add_collection_in_layers('project_generator', {
        _id: mongodb_id(),
        name: z.string(),
        project_type: z.string(),
        program: z.string(),
        enabled: z.boolean(),
    }).add_collection('user', {
        _id: mongodb_id(),
    })

    let user_required = async (context: Permission_Context<any>) =>{
        if(!context.auth_data.user_id){ 
            return {
                allow: false,
                block: true,
                query: context.query
            }
        }

        return {
            allow: false,
            block: false,
            query: context.query
        }
    }

    framework.collections.institution.add_permission_manager(user_required);
    framework.collections.institution.add_permission_manager(async (context) => {
        let role_memberships = await context.whiteboard.get('role_memberships', async () => {
            return framework.collections.role_membership.mongoose_model.aggregate([
                { 
                    $match: {
                        user_id: context.auth_data.user_id,
                        institution_id: context.parameters.institution
                    }
                }
            ])
        })

        return {
            allow: true,
            block: false,
            query: context.query
        }
    });

    framework.collections.client.add_permission_manager((context) => {
        return {
            allow: true,
            block: false,
            query: context.query
        }
    });

    framework.collections.project.add_permission_manager((context) => {
        return {
            allow: true,
            block: false,
            query: context.query
        }
    });

    framework.collections.project_generator.add_permission_manager((context) => {
        return {
            allow: true,
            block: false,
            query: context.query
        }
    });
    
    return framework;
}

async function do_basic_setup(framework: ReturnType<typeof get_framework>){
    let institution_a = await framework.collections.institution.mongoose_model.create({
        name: 'Institution A'
    })

    let institution_b = await framework.collections.institution.mongoose_model.create({
        name: 'Institution B'
    })

    let client_a = await framework.collections.institution.mongoose_model.create({
        name: 'Client A',
        institution_id: institution_a._id,
        current_numeral_id_index: 0,
    })

    let client_b = await framework.collections.institution.mongoose_model.create({
        name: 'Client B',
        institution_id: institution_a._id,
        current_numeral_id_index: 1,
    })

    let client_c = await framework.collections.institution.mongoose_model.create({
        name: 'Client C',
        institution_id: institution_b._id,
        current_numeral_id_index: 0,
    })

    let client_d = await framework.collections.institution.mongoose_model.create({
        name: 'Client D',
        institution_id: institution_b._id,
        current_numeral_id_index: 1,
    })

    let role_admin = await framework.collections.role.mongoose_model.create({
        institution_id: institution_a._id,
        name: 'Admin',
        permissions: {
            'client': ['read', 'create', 'update', 'delete'],
            'project': ['read', 'create', 'update', 'delete'],
            'project_generator': ['read', 'create', 'update', 'delete'],
            'role_membership': ['read', 'create', 'update', 'delete'],
            'client_role_membership':['read', 'create', 'update', 'delete'],
        }
    })

    let user_todd = await framework.collections.user.mongoose_model.create({
    })

    return {
        institution_a,
        institution_b,
        client_a,
        client_b,
        client_c,
        client_d,
        role_admin,
        user_todd
    }
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
            limit: 100,
            auth_fetcher: async (req, res) => {
                return {
                    is_super_admin: false,
                    permissions: [],
                    user_id: req.headers.authorization as string
                }
            },
            api_url_prefix: '/api'
        });
    
        server = express_app.listen(port, ()=> {
            console.log(`test server listening on port ${port}`);
        });
    })

    after(async function (){
        await server.close();
        mongoose.connection.modelNames().forEach(ele => mongoose.connection.deleteModel(ele));
        db_connection.modelNames().forEach(ele => db_connection.deleteModel(ele));
        await db_connection.disconnect()
    });

    beforeEach(async function(){
        for(let collection of Object.values(framework.collections)){
            await collection.mongoose_model.collection.drop();
        }
    })

    it('admins should be able to fetch anything', async function () {
        let { user_todd, institution_a } = await do_basic_setup(framework);
        
        
        let institution_response = await got.get(`http://localhost:${port}/api/institution/${institution_a._id}`, {
            headers: {
                authorization: user_todd._id
            }
        }).json();

        assert.deepEqual(JSON.parse(JSON.stringify(institution_a)), institution_response);
    });
});