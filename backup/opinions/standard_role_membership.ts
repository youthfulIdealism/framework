import { F_Collection } from "../F_Collection.js";
import { mongodb_id } from "../utils/mongoose_from_zod.js";
import { z, ZodObject, ZodRawShape, ZodString, ZodTypeAny } from "zod";

type type_mongodb_id = ZodString
type layer_object<Y extends string[]> = {[key in Y[number] as `${key}_id`]: type_mongodb_id};


export function extend_role_membership<T extends ZodRawShape, Q extends ZodObject<T>, Y extends string[]>(extend: Q, parent_layers: Y) {
    let asf = get_layer_object(parent_layers);
    return extend.extend(asf);
} 

export function get_layer_object<Y extends string[]>(collections: Y): layer_object<Y> & { user_id: type_mongodb_id } {
    let parent_layer_ids = {
        user_id: mongodb_id()
    } as layer_object<Y> & { user_id: type_mongodb_id };

    for(let collection of collections){
        //@ts-expect-error
        parent_layer_ids[collection + '_id'] = mongodb_id();
    }

    return parent_layer_ids;
}