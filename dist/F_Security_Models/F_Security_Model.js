export class F_Security_Model {
    collection;
    needs_auth_user;
    static auth_fetcher;
    constructor(collection) {
        this.collection = collection;
    }
    static set_auth_fetcher(fetcher) {
        F_Security_Model.auth_fetcher = fetcher;
    }
    static async has_permission(models, req, res, find, operation) { console.error(`F_Security_Model.has_permission is deprecated in favor of F_Security_Model.model_with_permission.`); return await F_Security_Model.model_with_permission(models, req, res, find, operation); }
    static async model_with_permission(models, req, res, find, operation) {
        let has_attempted_authenticating_user = false;
        for (let security_model of models) {
            if (security_model.needs_auth_user && !has_attempted_authenticating_user) {
                has_attempted_authenticating_user = true;
                req.auth = await F_Security_Model.auth_fetcher(req);
            }
            if (security_model.needs_auth_user && !req.auth) {
                continue;
            }
            if (await security_model.has_permission(req, res, find, operation)) {
                return security_model;
            }
        }
        return undefined;
    }
}
//# sourceMappingURL=F_Security_Model.js.map