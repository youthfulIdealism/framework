import { F_Security_Model } from "@liminalfunctions/framework/F_Security_Model.js";
let operation_permission_map = {
    'get': 'read',
    'create': 'create',
    'update': 'update',
    'delete': 'delete'
};
export class F_SM_Role_Membership_With_Parent_Path extends F_Security_Model {
    layer_collection_id;
    constructor(collection, layer_collection) {
        super(collection);
        this.needs_auth_user = true;
        this.layer_collection_id = layer_collection?.collection_id;
    }
    async has_permission(req, res, find, operation) {
        let permission_name = operation_permission_map[operation];
        let enabled_layer_ids = new Set(req.auth.layers.filter(ele => ele.layer === this.collection.collection_id).filter(ele => ele.permissions[this.collection.collection_name_plural].includes(permission_name)).map(ele => ele.layer_id + ''));
        let id_field = `${this.layer_collection_id}_ids`;
        console.log(find);
        switch (operation) {
            case "get":
            case "update":
            case "delete":
                if (find[id_field]) {
                    if (typeof find[id_field] === 'string') {
                        return enabled_layer_ids.has(find[id_field]);
                    }
                    else if (Array.isArray(find[id_field].$in)) {
                        let find_ids = find[id_field].$in;
                        return find_ids.find(ele => enabled_layer_ids.has(ele)) !== undefined;
                    }
                }
                return false;
            case "create":
                let create_ids = req.body[id_field];
                if (!Array.isArray(create_ids) || create_ids.find(ele => typeof ele !== 'string')) {
                    break;
                }
                return create_ids.find(ele => enabled_layer_ids.has(ele)) !== undefined;
        }
        return false;
    }
    async handle_empty_query_results(req, res, operation) {
        return { data: null };
    }
}
//# sourceMappingURL=F_SM_Role_Membership_With_Parent_Path.js.map