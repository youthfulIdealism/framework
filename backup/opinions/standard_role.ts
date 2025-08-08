import { z, ZodObject, ZodRawShape } from "zod";
const permission = z.array(z.enum(['read', 'create', 'update', 'delete']));
type permission_object<Y extends string[]> = {[key in Y[number]]: typeof permission};

export function extend_role<T extends ZodRawShape, Y extends string[]>(extend_candidate: ZodObject<T>, collections: Y) {
    return extend_candidate.extend({ collection_permissions: get_permission_object(collections)});
}

export function get_permission_object<Y extends string[]>(collections: Y): ZodObject<permission_object<Y>> {
    let permission_object = {} as {[key in Y[number]]: typeof permission};
    for(let key of Object.keys(collections)){
        permission_object[key as Y[number]] = permission;
    }

    return z.object(permission_object);
}