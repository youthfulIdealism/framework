import { compile } from './F_Compile.js';
export class F_Collection_Registry {
    collections;
    constructor() {
        this.collections = {};
    }
    register(collection) {
        let collections = this.collections;
        collections[collection.collection_id] = collection;
        return this;
    }
    compile(app, api_prefix) {
        for (let collection of Object.values(this.collections)) {
            compile(app, collection, api_prefix);
        }
    }
}
//# sourceMappingURL=F_Collection_Registry.js.map