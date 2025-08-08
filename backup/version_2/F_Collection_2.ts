import mongoose, { Model, Mongoose } from "mongoose";
import { z, ZodObject, ZodRawShape, ZodString } from "zod"
import { mongodb_id, mongoose_from_zod } from '../utils/mongoose_from_zod.js'
import { Request, Response, NextFunction, Router } from "express";
import { Auth_Data } from "../types/auth_data.js";
import { Framework_2 } from "./framework_2.js";
import { Permission_Manager } from "./permission_manager.js";
import { extend_organizational_layer } from "../opinions/standard_organization_layer.js";
import { Register_Configuration } from "./register_configuration.js";
import { Whiteboard } from "./whiteboard.js";
import { rmSync } from "fs";

type layer_object<Y extends string[]> = {[key in Y[number] as `${key}_id`]: ZodString};
type optional_layer_object<Y extends string[]> = {[key in Y[number] as `${key}_id`]: ZodString};

export type F_Collection_ID<Collection> = Collection extends F_Collection_2<infer Collection_ID extends string, infer Layers, infer ZodShape extends ZodRawShape> ? Collection_ID : never
export type F_Collection_Zod_Shape<Collection> = Collection extends F_Collection_2<infer Collection_ID extends string, infer Layers, infer ZodShape extends ZodRawShape> ? ZodRawShape : never
export type F_Collection_Zod_Object<Collection> = Collection extends F_Collection_2<infer Collection_ID extends string, infer Layers, infer ZodShape extends ZodRawShape> ? ZodObject<ZodRawShape> : never
export type Infer_F_Collection_Type<Collection> = Collection extends F_Collection_2<infer Collection_ID extends string, infer Layers, infer ZodShape extends ZodRawShape> ? F_Collection_2<Collection_ID, Layers, ZodShape> : never;
export type Collection_Query<Q> = ReturnType<Infer_F_Collection_Type<Q>["mongoose_model"]["find"]>

export class F_Collection_2<Collection_ID extends string, Layers extends string[], ZodShape extends ZodRawShape> {
    zod_schema: ZodObject<ZodShape>
    update_schema: ZodObject<ZodShape>
    create_schema: ZodObject<ZodShape>
    mongoose_model: Model<z.infer<typeof this.zod_schema>>;
    id: Collection_ID;
    layers: Layers
    
    permission_managers: Permission_Manager<typeof this, Layers>[];

    constructor(id: Collection_ID, zod_schema: ZodObject<ZodShape>) {
        this.id = id;
        this.zod_schema = zod_schema;
        //@ts-ignore
        this.update_schema = zod_schema.partial();
        //@ts-ignore
        this.create_schema = zod_schema.omit({_id: true});
        this.mongoose_model = mongoose_from_zod<z.infer<typeof zod_schema>>(this.id, zod_schema);
        this.permission_managers = [];
    }

    add_permission_manager(permission_manager: Permission_Manager<typeof this, Layers>){
        this.permission_managers.push(permission_manager);
    }

    register(app: Router,
            mongoose: Mongoose,
            config: Register_Configuration){
    
        let fetch_limit = config.limit || 100;
        let intermediary_layers = this.layers ? this.layers : config.intermediary_layers;
        let intermediary_layer_path = intermediary_layers.length > 0 ? intermediary_layers.map(ele => ele + '/:' + ele).join('/') + '/' : '';
        
        console.log(this.id)
        console.log(`${config.api_url_prefix}/${intermediary_layer_path}${this.id}/OBJECT_ID`)
        console.log()

        app.get(`${config.api_url_prefix}/${intermediary_layer_path}${this.id}`, async (req: Request, res: Response) => {
            let auth_data = await config.auth_fetcher(req, res);

            let query = this.mongoose_model.find({}) as Collection_Query<typeof this>;
            let whiteboard = new Whiteboard();

            for(let permission_manager of this.permission_managers){
                let permission_result = await permission_manager({
                    auth_data: auth_data,
                    query: query,
                    whiteboard: whiteboard,
                    parameters: req.params as {[key in Layers[number]]: string}
                })

                query = permission_result.query;

                if(permission_result.allow){
                    res.json(await query.limit(fetch_limit).lean());
                    return;
                }

                if(permission_result.block){
                    res.status(401).json({ error: 'permission to access this resource denied'});
                    return;
                }
            }
            
            res.status(401).json({ error: 'permission to access this resource denied'});
            return;
        });

        app.get(`${config.api_url_prefix}/${intermediary_layer_path}${this.id}/:document_id`, async (req: Request, res: Response) => {
            let auth_data = await config.auth_fetcher(req, res);

            let query = this.mongoose_model.find({ _id: req.params.document_id }) as Collection_Query<typeof this>;
            let whiteboard = new Whiteboard();

            for(let permission_manager of this.permission_managers){
                let permission_result = await permission_manager({
                    auth_data: auth_data,
                    query: query,
                    whiteboard: whiteboard,
                    parameters: req.params as {[key in Layers[number]]: string}
                })

                query = permission_result.query;

                if(permission_result.allow){
                    let result = await query.limit(1).lean();
                    if(result.length > 0){
                        res.json(result[0]);
                    } else {
                        res.status(404).json({ error: 'document does not exist'});
                    }
                    
                    return;
                }

                if(permission_result.block){
                    res.status(401).json({ error: 'permission to access this resource denied'});
                    return;
                }
            }
            
            res.status(401).json({ error: 'permission to access this resource denied'});
            return;
        });

        app.post(`${config.api_url_prefix}/${intermediary_layer_path}${this.id}`, async (req: Request, res: Response) => {
            let { success, error, data } = this.create_schema.safeParse(req.body);
            if(!success){
                console.error(error)
                res.status(400).json(error);
            }

            res.json(await this.mongoose_model.create(data));
        });
    }
}

export function collection_with_layers<Layers extends string[], Collection_ID extends string, ZodShape extends ZodRawShape>
    (id: Collection_ID, layers: Layers, zod_schema: ZodObject<ZodShape>){
    let retval = new F_Collection_2(id, zod_schema.extend(get_layer_object(layers)));
    retval.layers = layers.slice();
    return retval;
}

function get_layer_object<Y extends string[]>(collections: Y): layer_object<Y> {
    let parent_layer_ids = {} as layer_object<Y>;
    for(let collection of collections){
        //@ts-ignore
        parent_layer_ids[collection + '_id'] = mongodb_id();
    }
 
    //@ts-ignore
    return parent_layer_ids;
}


export function collection_with_optional_layers<Layers extends string[], Collection_ID extends string, ZodShape extends ZodRawShape>
    (id: Collection_ID, layers: Layers, zod_schema: ZodObject<ZodShape>){
    let retval = new F_Collection_2(id, zod_schema.extend(get_optional_layer_object(layers)));
    // TODO: this... is actually tricky. I think
    // the paths shouldn't involve layers; that
    // should be done in the query.
    retval.layers = [];
    return retval;
}

function get_optional_layer_object<Y extends string[]>(collections: Y): optional_layer_object<Y> {
    let parent_layer_ids = {} as layer_object<Y>;
    for(let collection of collections){
        //@ts-ignore
        parent_layer_ids[collection + '_id'] = mongodb_id().optional();
    }
 
    //@ts-ignore
    return parent_layer_ids;
}



// to generate docs:
// https://www.npmjs.com/package/zod-to-json-schema

