export class Cache<T> {
    timeout_map: Map<string, NodeJS.Timeout>;
    base_cache: Map<string, T>;
    refetch_map: Map<string, Promise<T>>;
    duration: number;

    constructor(duration: number) {
        this.timeout_map = new Map<string, NodeJS.Timeout>();
        this.base_cache = new Map<string, T>();
        this.refetch_map = new Map<string, Promise<T>>();
        this.duration = duration;
    }

    get(key: string): T {
        this.reset_expiry_timer_for(key);
        return this.base_cache.get(key);
    }

    set(key: string, value: T) {
        this.base_cache.set(key, value);
        this.reset_expiry_timer_for(key);
    }

    reset_expiry_timer_for(key: string) {
        // if the cache already has a timeout for this key,
        // stop the countdown. We don't want a key that was
        //recently used getting deleted by an old timeout.
        if(this.timeout_map.has(key)) {
            clearTimeout(this.timeout_map.get(key));
        }

        // add a timeout to the timeout map. When the timeout runs out, it'll remove the key from the cache.
        // TODO: should I also give the cache a maximum size? It'd be cool if it had the ability to max out
        // at a certain number of elements and reacted by throwing away the oldest ones. Definitely a premature
        // optimization, though.
        if(this.base_cache.has(key)){
            this.timeout_map.set(key, setTimeout(() => {
                this.base_cache.delete(key);
                this.timeout_map.delete(key);
            }, this.duration));
        }
    }

    delete(key: string) {
        this.base_cache.delete(key);
        clearTimeout(this.timeout_map.get(key));
        this.timeout_map.delete(key);
    }

    async first_get_then_fetch(key: string, fetch_function: () => Promise<T>): Promise<T> {
        // if we already have the key in the cache, just return it.
        if (this.base_cache.has(key)) { return this.get(key); }

        // ...otherwise, if we're already fetching the data, wait for
        // the fetch to finish and return its results.
        if(this.refetch_map.has(key)){
            let result_value;
            try{
                result_value = await this.refetch_map.get(key);
            } catch(err){
                return Promise.reject(err);
            }
            return result_value;
        }

        // ...if we're not already fetching the data,...
        // ...start to fetch it
        let result_value;
        let fetch_promise = fetch_function().finally(() => {
            this.refetch_map.delete(key);
        });
        // ...store the fetch promise in the refetch_map so that any fetch
        // operations on the same key can use the fetch that's already being
        // executed instead of starting a new fetch
        this.refetch_map.set(key, fetch_promise)

        // ...wait for the results,...
        try {
            result_value = await fetch_promise;
        } catch(err){
            // ...throwing an error if necessary,...
            return Promise.reject(err);
        }

        // ...and setting & returning the restults if there's no error.
        this.set(key, result_value);
        return result_value;
    }

    async first_fetch_then_refresh(key: string, fetch_function: () => Promise<T>): Promise<T> {
        /*console.log('first_fetch_then_refresh')
        console.log(this.refetch_map.has(key))
        console.log(this.base_cache.has(key))*/

        // if we're already refetching the value for the key, don't
        // start refetching the value. It doesn't make sense to refetch
        // a value we're already fetching. Wait for the existing refetch if necessary.
        if(this.refetch_map.has(key)){
            // if we already have the value, we can return anyway.
            if (this.base_cache.has(key)) { return this.get(key); }

            // otherwise, return whatever is returned by the existing fetch promise.
            let result_value;
            try{
                result_value = await this.refetch_map.get(key);
            } catch(err){
                return Promise.reject(err);
            }
            return result_value;
        }

        // if we already have the key, start a fetch promise and return the existing key
        if (this.base_cache.has(key)) { 
            let result_value = this.get(key);

            let fetch_promise = fetch_function().finally(() => {
                this.refetch_map.delete(key);
            });
            // ...store the fetch promise in the refetch_map so that any fetch
            // operations on the same key can use the fetch that's already being
            // executed instead of starting a new fetch
            this.refetch_map.set(key, fetch_promise)

            return result_value;
        }

        // if we don't have the key, generate a fetch promise and return whatever it returns.
        let retval;
        let fetch_promise = fetch_function().finally(() => {
            this.refetch_map.delete(key);
        });
        // ...store the fetch promise in the refetch_map so that any fetch
        // operations on the same key can use the fetch that's already being
        // executed instead of starting a new fetch
        this.refetch_map.set(key, fetch_promise)

        // ...wait for the results,...
        try {
            retval = await fetch_promise;
        } catch(err){
            // ...throwing an error if necessary,...
            return Promise.reject(err);
        }

        // ...and setting & returning the restults if there's no error.
        this.set(key, retval);
        return retval;
    }
}