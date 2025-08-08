import { F_Security_Model } from "./F_Security_Model.js";
export class F_SM_Open_Access extends F_Security_Model {
    constructor(collection) {
        super(collection);
        this.needs_auth_user = false;
    }
    async has_permission(req, res, find, operation) {
        return true;
    }
    async handle_empty_query_results(req, res, operation) {
        return { data: null };
    }
}
//# sourceMappingURL=F_SM_Open_Access.js.map