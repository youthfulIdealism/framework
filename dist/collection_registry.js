class Collection_Registry {
    collections;
    constructor() {
        this.collections = {};
    }
    register(collection) {
        let collections = this.collections;
        collections[collection.collection_id] = collection;
        return this;
    }
}
export {};
//# sourceMappingURL=collection_registry.js.map