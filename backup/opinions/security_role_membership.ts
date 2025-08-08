import { NextFunction } from "express"
import { F_Collection } from "../F_Collection.js"
import { Auth_Data } from "../types/auth_data.js"
import { ZodAny } from "zod"


type auth_fetcher_args = {
    user_collection: F_Collection<{ _id: ZodAny }>,
    organization_layers: {
        layer: F_Collection<{
            _id: ZodAny
            user_id: ZodAny
        }>,
        membership: F_Collection<{
            _id: ZodAny
            user_id: ZodAny
        }>,
    }[]
}

export function get_standard_role_based_auth(auth_fetcher_params: auth_fetcher_args){
    return (req: Request, res: Response, next: NextFunction): void => {
        
    }
}