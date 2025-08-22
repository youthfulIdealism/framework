export class F_Layer {
    path;
    layer_id;
    collections;
    layers;
    constructor(layer_id) {
        this.layer_id = layer_id;
        this.collections = {};
        this.layers = {};
    }
    add_layer(layer) {
        let result = this.clone();
        result.layers[layer.layer_id] = layer;
        return result;
    }
    add_collection(collection) {
        let result = this.clone();
        result.collections[collection.collection_id] = collection;
        return result;
    }
    clone() {
        let clone = new F_Layer(this.layer_id);
        clone.collections = Object.assign({}, this.collections);
        for (let [child_layer_id, child_layer] of Object.entries(this.layers)) {
            clone.layers[child_layer_id] = child_layer.clone();
        }
        return clone;
    }
    layer(layer_id) {
        return this.layers[layer_id];
    }
    collection(collection_id) {
        return this.collections[collection_id];
    }
}
//# sourceMappingURL=F_Client_Collection_Registry.js.map