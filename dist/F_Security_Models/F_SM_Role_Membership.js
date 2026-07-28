import { F_Security_Model } from "./F_Security_Model.js";
let operation_permission_map = {
    'get': 'read',
    'create': 'create',
    'update': 'update',
    'delete': 'delete'
};
export class F_SM_Role_Membership extends F_Security_Model {
    layer_collection_id;
    constructor(collection, layer_collection) {
        super(collection);
        this.needs_auth_user = true;
        this.layer_collection_id = layer_collection?.collection_id;
    }
    async has_permission(req, res, find, operation) {
        let layer_document_id = this.layer_collection_id ? (req.params[this.layer_collection_id] ?? req.params.document_id) : undefined;
        let auth_permissions = req.auth.layers.find(ele => ele.layer === this.layer_collection_id && ele.layer_id + '' === layer_document_id);
        if (!auth_permissions) {
            return false;
        }
        if (!auth_permissions.permissions) {
            console.warn(`request auth object was missing its permissions field`);
            return false;
        }
        if (!auth_permissions.permissions[this.collection.collection_name_plural]) {
            console.warn(`request auth object was missing its permissions.${this.collection.collection_name_plural} field`);
            return false;
        }
        return auth_permissions.permissions[this.collection.collection_name_plural].includes(operation_permission_map[operation]);
    }
    async handle_empty_query_results(req, res, operation) {
        return { data: null };
    }
}
//# sourceMappingURL=F_SM_Role_Membership.js.map