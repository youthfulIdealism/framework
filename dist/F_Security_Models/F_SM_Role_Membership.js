import { Cache } from "../utils/cache.js";
import { F_Security_Model } from "./F_Security_Model.js";
import mongoose from "mongoose";
let operation_permission_map = {
    'get': 'read',
    'create': 'create',
    'update': 'update',
    'delete': 'delete'
};
export class F_SM_Role_Membership extends F_Security_Model {
    user_id_field;
    role_id_field;
    layer_collection_id;
    role_membership_collection;
    role_membership_cache;
    role_collection;
    role_cache;
    constructor(collection, layer_collection, role_membership_collection, role_collection, role_membership_cache, role_cache, user_id_field = 'user_id', role_id_field = 'role_id') {
        super(collection);
        this.needs_auth_user = true;
        this.user_id_field = user_id_field;
        this.role_id_field = role_id_field;
        this.layer_collection_id = layer_collection.collection_id;
        this.role_membership_collection = role_membership_collection;
        this.role_membership_cache = role_membership_cache ?? new Cache(60);
        this.role_collection = role_collection;
        this.role_cache = role_cache ?? new Cache(60);
        if (!this.role_collection.mongoose_schema.permissions) {
            throw new Error(`could not find field "permissions" on role collection. Permissions should be an object of the format {[key: collection_id]: ('read'| 'create'| 'update'| 'delete')[]}`);
        }
    }
    async has_permission(req, res, find, operation) {
        let user_id = req.auth.user_id;
        let layer_id = req.params[this.layer_collection_id] ?? req.params.document_id;
        let role_membership = await this.role_membership_cache.first_fetch_then_refresh(`${user_id}-${layer_id}`, async () => {
            let role_memberships = await this.role_membership_collection.mongoose_model.find({
                [this.user_id_field]: user_id,
                [`${this.layer_collection_id}_id`]: new mongoose.Types.ObjectId(layer_id)
            }, {}, { lean: true });
            if (role_memberships.length > 1) {
                console.warn(`in F_SM_Role_Membership, more than one role membership for user ${user_id} at layer ${this.layer_collection_id} found.`);
            }
            return role_memberships[0];
        });
        if (!role_membership) {
            return false;
        }
        if (!role_membership[this.role_id_field]) {
            console.warn(`role membership collection ${this.role_membership_collection.collection_id} did not have role ID filed ${this.role_id_field}`);
            return false;
        }
        let role = await this.role_cache.first_fetch_then_refresh(role_membership[this.role_id_field], async () => {
            let role = await this.role_collection.mongoose_model.findById(role_membership[this.role_id_field], {}, { lean: true });
            return role;
        });
        if (!role) {
            return false;
        }
        if (!role.permissions) {
            console.warn(`role collection ${this.role_collection.collection_id} was missing its permissions field`);
            return false;
        }
        if (!role.permissions[this.collection.collection_id]) {
            console.warn(`role collection ${this.role_collection.collection_id} was missing its permissions.${this.collection.collection_id} field`);
            return false;
        }
        return role.permissions[this.collection.collection_id].includes(operation_permission_map[operation]);
    }
    async handle_empty_query_results(req, res, operation) {
        return { data: null };
    }
}
//# sourceMappingURL=F_SM_Role_Membership.js.map