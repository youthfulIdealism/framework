import assert from "assert";
import { z, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'

import { schema_from_zod, z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { Schema } from 'mongoose'

import { Cache } from '../dist/utils/cache.js'

describe('Cache', function () {

    function sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    it('should be able to set and regurgitate elements at a key', async function () {
        let cache = new Cache(10);

        const key = 'best_animal'
        const value = { 'test': 'flamingo' }
        
        cache.set(key, value);
        assert.deepEqual(cache.get(key), value);
    });

    it('should be able to set and regurgitate elements at a key using the first_get_then_fetch method', async function () {
        let cache = new Cache(10);

        const key = 'best_animal'
        const value = { 'test': 'flamingo' }
        
        assert.deepEqual(await cache.first_get_then_fetch(key, async () => value), value);
    });

    it('should set values in the cache for later retrieval when using the first_get_then_fetch method', async function () {
        let cache = new Cache(10);

        const key = 'best_animal'
        const value = { 'test': 'flamingo' }

        await cache.first_get_then_fetch(key, async () => value)
        
        assert.deepEqual(cache.get(key), value);
    });

    it('cache values set through the standard set method should expire', async function () {
        let cache = new Cache(10);

        const key = 'best_animal'
        const value = { 'test': 'flamingo' }
        
        cache.set(key, value);

        await sleep(20);

        assert.deepEqual(cache.get(key), undefined);
    });

    it('cache values set through the first_get_then_fetch method should expire', async function () {
        let cache = new Cache(10);

        const key = 'best_animal'
        const value = { 'test': 'flamingo' }
        
        await cache.first_get_then_fetch(key, async () => value)

        await sleep(20);

        assert.deepEqual(cache.get(key), undefined);
    });

    it('if should delay throwing away the cached value every time the key is set', async function () {
        let cache = new Cache(5);

        const key = 'best_animal'
        const value = { 'test': 'flamingo' }
        
        cache.set(key, value);
        await sleep(2);
        cache.set(key, value);
        await sleep(2);
        cache.set(key, value);
        await sleep(2);
        cache.set(key, value);
        await sleep(2);
        cache.set(key, value);
        await sleep(2);
        cache.set(key, value);
        await sleep(2);

        assert.deepEqual(cache.get(key), value);
    });

    it('if should delay throwing away the cached value every time the key is fetched', async function () {
        let cache = new Cache(5);

        const key = 'best_animal'
        const value = { 'test': 'flamingo' }
        
        cache.set(key, value);
        await sleep(2);
        cache.get(key);
        await sleep(2);
        cache.get(key);
        await sleep(2);
        cache.get(key);
        await sleep(2);
        cache.get(key);
        await sleep(2);
        cache.get(key);
        await sleep(2);

        assert.deepEqual(cache.get(key), value);
    });

    it('if the first_get_then_fetch method throws an error, it should be passed upstream to be caught.', async function () {
        let cache = new Cache(10);

        const key = 'best_animal'
        const value = { 'test': 'flamingo' }
        
        assert.rejects(async() => {
            await cache.first_get_then_fetch(key, async () => { throw new Error('bad data here bro') })
        }, {message: 'bad data here bro'})
    });

    it('if the first_get_then_fetch method is called multiple times, the fetch method should run only once.', async function () {
        let cache = new Cache(30);

        const key = 'best_animal'
        const value = { 'test': 'flamingo' }
        
        let run_counter = 0;

        cache.first_get_then_fetch(key, async () => { run_counter++; await sleep(5); return value; })
        cache.first_get_then_fetch(key, async () => { run_counter++; await sleep(5); return value; })
        cache.first_get_then_fetch(key, async () => { run_counter++; await sleep(5); return value; })
        await cache.first_get_then_fetch(key, async () => { run_counter++; await sleep(5); return value; })
        await sleep(5);

        assert.deepEqual(cache.get(key), value);
        assert.deepEqual(run_counter, 1);
    });

    it('if the first_fetch_then_refresh method is called and the key is not in the cache, it should be fetched', async function () {
        let cache = new Cache(30);

        const key = 'best_animal'
        const value = { 'test': 'flamingo' }
        
        let fetch_method = async () => { return value; };

        await cache.first_fetch_then_refresh(key, fetch_method)

        assert.deepEqual(cache.get(key), value);
    });

    it('if the first_fetch_then_refresh method is called multiple times, the fetch method should run only once.', async function () {
        let cache = new Cache(30);

        const key = 'best_animal'
        const value = { 'test': 'flamingo' }
        
        let fetch_method = async () => { run_counter++; await sleep(5); return value; };
        let run_counter = 0;

        cache.first_fetch_then_refresh(key, fetch_method)
        cache.first_fetch_then_refresh(key, fetch_method)
        cache.first_fetch_then_refresh(key, fetch_method)
        await cache.first_fetch_then_refresh(key, fetch_method)
        await sleep(5);

        assert.deepEqual(cache.get(key), value);
        assert.deepEqual(run_counter, 1);
    });

    
    it('if the first_fetch_then_refresh method is called when the cache already has the key, it should still refetch after the value is returned.', async function () {
        let cache = new Cache(30);

        const key = 'best_animal'
        const value = { 'test': 'flamingo' }
        
        let fetch_method = async () => { await sleep(5); run_counter++; return value; };
        let run_counter = 0;

        cache.set(key, value);

        assert.deepEqual(cache.get(key), value);
        assert.deepEqual(run_counter, 0);

        let fetch_promise = cache.first_fetch_then_refresh(key, fetch_method)

        assert.deepEqual(run_counter, 0);

        await fetch_promise;
        await sleep(7);

        assert.deepEqual(cache.get(key), value);
        assert.deepEqual(run_counter, 1);
    });

});