import * as z from 'zod/v4'
import { F_Collection } from './F_Collection.js';


export class F_Layer<Layer_ID extends string, Layers = {}, Collections = {}> {
    path: string[]
    layer_id: Layer_ID
    collections: Collections;
    layers: Layers;

    constructor(layer_id: Layer_ID) {
        this.layer_id = layer_id;
        this.collections = {} as Collections;
        this.layers = {} as Layers;
    }

    add_layer<Child_Layer_ID extends string, Child_Layers, Child_Collections>(layer: F_Layer<Child_Layer_ID, Child_Layers, Child_Collections>)
    : F_Layer<
            Layer_ID, 
            Layers & { [key in Child_Layer_ID]: F_Layer<Child_Layer_ID, Child_Layers, Child_Collections>},
            Collections
        > {
        let result = this.clone() as F_Layer<
            Layer_ID, 
            Layers & { [key in Child_Layer_ID]: F_Layer<Child_Layer_ID, Child_Layers, Child_Collections> },
            Collections
        >;
        // @ts-expect-error
        result.layers[layer.layer_id] = layer;
        return result; 
    }

    add_collection<Collection_ID extends string, ZodSchema extends z.ZodObject>(collection: F_Collection<Collection_ID, ZodSchema>)
    : F_Layer<
            Layer_ID, 
            Layers,
            Collections & { [key in Collection_ID]:  F_Collection<Collection_ID, ZodSchema>}
        > {
        let result = this.clone() as F_Layer<
            Layer_ID, 
            Layers,
            Collections & { [key in Collection_ID]:  F_Collection<Collection_ID, ZodSchema>}
        >;
        // @ts-expect-error
        result.collections[collection.collection_id] = collection;
        return result;
    }

    clone(): typeof this {
        let clone = new F_Layer(this.layer_id) as typeof this;
        clone.collections = Object.assign({}, this.collections);
        for(let [child_layer_id, child_layer] of Object.entries(this.layers)){
            //@ts-expect-error
            clone.layers[child_layer_id] = child_layer.clone();
        }
        return clone;
    }

    layer<Layer_ID extends keyof Layers>(layer_id: Layer_ID){
        return this.layers[layer_id];
    }

    collection<Collection_ID extends keyof Collections>(collection_id: Collection_ID){
        return this.collections[collection_id];
    }
}