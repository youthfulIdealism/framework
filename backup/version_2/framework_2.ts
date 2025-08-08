import { boolean, z, ZodObject, ZodRawShape } from "zod";
import { F_Collection } from "../F_Collection.js";
import { mongodb_id } from "../utils/mongoose_from_zod.js";
import { extend_organizational_layer } from "../opinions/standard_organization_layer.js";
import { extend_role_membership } from "../opinions/standard_role_membership.js";
import { extend_role } from "../opinions/standard_role.js";
import { Auth_Data } from "../types/auth_data.js";
import { Router } from "express";
import { Mongoose } from "mongoose";
import { F_Collection_2, collection_with_layers } from "./F_Collection_2.js";
import { Register_Configuration } from "./register_configuration.js";


type ValuesOf<T extends string[]> = T[number];
type MapFromArray<T extends string[], Q> = {[key in T[number]]: Q} 
type Auth_Context_Fetch_Function<Q, Layers extends string[]> = (params: MapFromArray<Layers, string>, auth: Auth_Data) => Q
type Auth_Context_Fetcher<ID extends string, Layers extends string[], Q> = {id: ID, fetch: Auth_Context_Fetch_Function<Q, Layers>}

type Infer_F_Collection_Type<Q> = Q extends F_Collection<infer R> ? R : never;
type Infer_F_Collection<Q> = Q extends F_Collection<infer R> ? F_Collection<R> : never;
type Collection_Query<Q> = ReturnType<Infer_F_Collection<Q>["mongoose_model"]["find"]>

export class Framework_2<
        Layers extends string[] = [],
        Collections = { },
    >{
    
    organization_layers: Layers;
    collections: Collections

    constructor(){
        this.organization_layers = [] as Layers;
        this.collections = { } as Collections;
    }

    add_organizational_layer<Collection_ID extends string, Collection_Shape extends ZodRawShape>(collection_id: Collection_ID, collection_shape: Collection_Shape)
        : Framework_2<
            [...Layers, Collection_ID],
            Collections & {[key in Collection_ID]: ReturnType<typeof collection_with_layers<Layers, Collection_ID, Collection_Shape>>}
        > {
        //@ts-expect-error
        this.collections[collection_id] = collection_with_layers(collection_id, this.organization_layers, z.object(collection_shape))

        if(this.organization_layers.includes(collection_id)){
            throw new Error(`Framework already has organization layer ${collection_id}`)
        }
        this.organization_layers.push(collection_id);
        
        //@ts-expect-error
        return this;
    }

    add_collection<Collection_ID extends string, Collection_Shape extends ZodRawShape>(collection_id: Collection_ID, collection_shape: Collection_Shape)
        : Framework_2<
            Layers,
            Collections & {[key in Collection_ID]: F_Collection_2<Collection_ID, [], Collection_Shape>}
        > {
        //@ts-expect-error
        this.collections[collection_id] = new F_Collection_2(collection_id, z.object(collection_shape));
        //@ts-expect-error
        return this;
    }

    add_collection_in_layers<Collection_ID extends string, Collection_Shape extends ZodRawShape>(collection_id: Collection_ID, collection_shape: Collection_Shape)
        : Framework_2<
            Layers,
            Collections & {[key in Collection_ID]: ReturnType<typeof collection_with_layers<Layers, Collection_ID, Collection_Shape>>}
        > {
        //@ts-expect-error
        this.collections[collection_id] = collection_with_layers(collection_id, this.organization_layers, z.object(collection_shape));
        //@ts-expect-error
        return this;
    }

    add_collection_optionally_in_layers<Collection_ID extends string, Collection_Shape extends ZodRawShape>(collection_id: Collection_ID, collection_shape: Collection_Shape)
        : Framework_2<
            Layers,
            Collections & {[key in Collection_ID]: ReturnType<typeof collection_with_layers<Layers, Collection_ID, Collection_Shape>>}
        > {
        //@ts-expect-error
        this.collections[collection_id] = collection_with_optional_layers(collection_id, this.organization_layers, z.object(collection_shape));
        //@ts-expect-error
        return this;
    }

    register(app: Router, mongoose: Mongoose, config: Omit<Register_Configuration, 'intermediary_layers'>): void {
        let register_configuration = Object.assign({
            intermediary_layers: this.organization_layers,
        }, config)

        for(let [key, value] of Object.entries(this.collections)){
            value.register(app, mongoose, register_configuration)
        }
    }
}

/*
let q = new Framework_2();
let layer_institution = q.add_organizational_layer('institution', new F_Collection_2('institution', z.object({
    name: z.string(),
})))

let layer_client = layer_institution.add_organizational_layer('client', collection_with_layers('client', layer_institution.organization_layers, z.object({
    name: z.string(),
})));

let skrunk = layer_client.add_collection('basic_collection', {
    _id: mongodb_id(),
    name: z.string(),
    age: z.number(),
    is_todd: z.boolean(),
    date_deceased: z.coerce.date().optional()
});*/



/*let client_object = F_Collection_2.with_layers('client_object', layer_client.organization_layers, z.object({
    id: mongodb_id(),
    name: z.string(),
    counter: z.number(),
}))*/

/*
let client_object = new F_Collection_2('client_object', z.object({
    id: mongodb_id(),
    name: z.string(),
    counter: z.number(),
}))

client_object.add_permission_manager((context) => {
    return {
        allow: false,
        block: false,
        query: context.query
    }
})

layer_client.add_collection('client_object', client_object);

let ex = await client_object.mongoose_model.findOne().lean();
*/