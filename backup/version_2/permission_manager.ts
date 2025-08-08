import { ZodRawShape } from "zod"
import { F_Collection_2, Collection_Query } from "./F_Collection_2.js"
import { Auth_Data } from "../types/auth_data.js"
import { Whiteboard } from "./whiteboard.js"

export type Permission_Context<Collection, Layers extends string[]> = {
    auth_data: Auth_Data,
    whiteboard: Whiteboard,
    query: Collection_Query<Collection>,
    parameters: {[key in Layers[number]]: string}
}

export type Permission_Result<Collection_Shape> = {
    allow: boolean,
    block: boolean,
    query: Collection_Query<Collection_Shape>,
}

export type Permission_Manager<Collection, Layers extends string[]> = (context: Permission_Context<Collection, Layers>) => Promise<Permission_Result<Collection>>