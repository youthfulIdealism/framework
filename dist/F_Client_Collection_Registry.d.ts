import * as z from 'zod/v4';
import { F_Collection } from './F_Collection.js';
export declare class F_Layer<Layer_ID extends string, Layers = {}, Collections = {}> {
    path: string[];
    layer_id: Layer_ID;
    collections: Collections;
    layers: Layers;
    constructor(layer_id: Layer_ID);
    add_layer<Child_Layer_ID extends string, Child_Layers, Child_Collections>(layer: F_Layer<Child_Layer_ID, Child_Layers, Child_Collections>): F_Layer<Layer_ID, Layers & {
        [key in Child_Layer_ID]: F_Layer<Child_Layer_ID, Child_Layers, Child_Collections>;
    }, Collections>;
    add_collection<Collection_ID extends string, ZodSchema extends z.ZodObject>(collection: F_Collection<Collection_ID, ZodSchema>): F_Layer<Layer_ID, Layers, Collections & {
        [key in Collection_ID]: F_Collection<Collection_ID, ZodSchema>;
    }>;
    clone(): typeof this;
    layer<Layer_ID extends keyof Layers>(layer_id: Layer_ID): Layers[Layer_ID];
    collection<Collection_ID extends keyof Collections>(collection_id: Collection_ID): Collections[Collection_ID];
}
