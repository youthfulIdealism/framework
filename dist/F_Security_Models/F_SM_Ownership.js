import { F_Security_Model } from "./F_Security_Model.js";
export class F_SM_Ownership extends F_Security_Model {
    user_id_field;
    constructor(collection, user_id_field = 'user_id') {
        super(collection);
        this.needs_auth_user = true;
        this.user_id_field = user_id_field;
    }
    async has_permission(req, res, find, operation) {
        let user_id = '' + req.auth.user_id;
        if (operation === 'get') {
            if (req.params.document_id) {
                find[this.user_id_field] = user_id;
                return true;
            }
            if (find[this.user_id_field] === user_id) {
                return true;
            }
        }
        if (operation === 'update') {
            find[this.user_id_field] = user_id;
            return true;
        }
        if (operation === 'create') {
            if (req.body[this.user_id_field] === user_id) {
                return true;
            }
        }
        if (operation === 'delete') {
            find[this.user_id_field] = user_id;
            return true;
        }
        return false;
    }
    async handle_empty_query_results(req, res, operation) {
        if (req.params.document_id) {
            let document_result = await this.collection.mongoose_model.findById(req.params.document_id);
            if (document_result) {
                res.status(403);
                return { error: `You do not have permission to ${operation} documents from ${req.params.document_type}.` };
            }
        }
        return { data: null };
    }
}
//# sourceMappingURL=F_SM_Ownership.js.map