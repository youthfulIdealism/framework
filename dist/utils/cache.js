export class Cache {
    timeout_map;
    base_cache;
    refetch_map;
    duration;
    constructor(duration) {
        this.timeout_map = new Map();
        this.base_cache = new Map();
        this.refetch_map = new Map();
        this.duration = duration;
    }
    get(key) {
        this.reset_expiry_timer_for(key);
        return this.base_cache.get(key);
    }
    set(key, value) {
        this.base_cache.set(key, value);
        this.reset_expiry_timer_for(key);
    }
    reset_expiry_timer_for(key) {
        if (this.timeout_map.has(key)) {
            clearTimeout(this.timeout_map.get(key));
        }
        if (this.base_cache.has(key)) {
            this.timeout_map.set(key, setTimeout(() => {
                this.base_cache.delete(key);
                this.timeout_map.delete(key);
            }, this.duration));
        }
    }
    delete(key) {
        this.base_cache.delete(key);
        clearTimeout(this.timeout_map.get(key));
        this.timeout_map.delete(key);
    }
    async first_get_then_fetch(key, fetch_function) {
        if (this.base_cache.has(key)) {
            return this.get(key);
        }
        if (this.refetch_map.has(key)) {
            let result_value;
            try {
                result_value = await this.refetch_map.get(key);
            }
            catch (err) {
                return Promise.reject(err);
            }
            return result_value;
        }
        let result_value;
        let fetch_promise = fetch_function().finally(() => {
            this.refetch_map.delete(key);
        });
        this.refetch_map.set(key, fetch_promise);
        try {
            result_value = await fetch_promise;
        }
        catch (err) {
            return Promise.reject(err);
        }
        this.set(key, result_value);
        return result_value;
    }
    async first_fetch_then_refresh(key, fetch_function) {
        if (this.refetch_map.has(key)) {
            if (this.base_cache.has(key)) {
                return this.get(key);
            }
            let result_value;
            try {
                result_value = await this.refetch_map.get(key);
            }
            catch (err) {
                return Promise.reject(err);
            }
            return result_value;
        }
        if (this.base_cache.has(key)) {
            let result_value = this.get(key);
            let fetch_promise = fetch_function().finally(() => {
                this.refetch_map.delete(key);
            });
            this.refetch_map.set(key, fetch_promise);
            return result_value;
        }
        let retval;
        let fetch_promise = fetch_function().finally(() => {
            this.refetch_map.delete(key);
        });
        this.refetch_map.set(key, fetch_promise);
        try {
            retval = await fetch_promise;
        }
        catch (err) {
            return Promise.reject(err);
        }
        this.set(key, retval);
        return retval;
    }
}
//# sourceMappingURL=cache.js.map