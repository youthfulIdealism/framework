import assert from "assert";
import { array, boolean, z, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { query_validator_from_zod } from '../dist/utils/query_validator_from_zod.js';
import { query_object_to_mongodb_query, query_object_to_mongodb_limits } from '../dist/utils/query_object_to_mongodb_query.js';
import { Schema } from 'mongoose'

import { Cache } from '../dist/utils/cache.js'

describe('query validator to mongodb query', function () {

    class Query_Mock {
        filter: any
        meta: any

        constructor(){
            this.filter = {};
            this.meta = {};

        }

        sort(sort){
            this.meta.sort = sort;
            return this;
        }

        limit(limit){
            this.meta.limit = limit;
            return this;
        }

        gt(path, value){
            this.filter[path] = {
                $gt: value
            }
            return this;
        }

        lt(path, value){
            this.filter[path] = {
                $lt: value
            }
            return this;
        }
    }


    it('should be able to transform basic parameters into a mongodb query', async function () {
        let query_validator = query_validator_from_zod(z.object({
            enum: z.enum(['one', 'two']),
            string: z.string(),
            number: z.number(),
            int: z.int(),
            nest: z.object({
                nested: z.string()
            }),
            boolean: z.boolean(),
            date: z.date(),
            object_id: z_mongodb_id,
            array: z.array(z.string())
        }))

        let date = new Date();

        assert.deepEqual(
            query_object_to_mongodb_query(query_validator.parse({
                enum: 'one',
                string: 'string',
                number: '54',
                int: '43',
                'nest.nested': 'panko',
                boolean: 'true',
                date: date.toISOString(),
                object_id: '6894cba684185cb03275d511',
                array: 'chupacabra'
            })),
            {
                enum: 'one',
                string: 'string',
                number: 54,
                int: 43,
                'nest.nested': 'panko',
                boolean: true,
                date: date,
                object_id: '6894cba684185cb03275d511',
                array: 'chupacabra'
            }
        )
    });

    it('should be able to transform gt', async function () {
        let query_validator = query_validator_from_zod(z.object({
            param: z.number(),
        }))

        assert.deepEqual(
            query_object_to_mongodb_query(query_validator.parse({
                param_gt: '5'
            })),
            {
                param: {
                    $gt: 5
                }
            }
        )
    });

    it('should be able to transform gte', async function () {
        let query_validator = query_validator_from_zod(z.object({
            param: z.number(),
        }))

        assert.deepEqual(
            query_object_to_mongodb_query(query_validator.parse({
                param_gte: '5'
            })),
            {
                param: {
                    $gte: 5
                }
            }
        )
    });

    it('should be able to transform lt', async function () {
        let query_validator = query_validator_from_zod(z.object({
            param: z.number(),
        }))

        assert.deepEqual(
            query_object_to_mongodb_query(query_validator.parse({
                param_lt: '5'
            })),
            {
                param: {
                    $lt: 5
                }
            }
        )
    });

    it('should be able to transform lte', async function () {
        let query_validator = query_validator_from_zod(z.object({
            param: z.number(),
        }))

        assert.deepEqual(
            query_object_to_mongodb_query(query_validator.parse({
                param_lte: '5'
            })),
            {
                param: {
                    $lte: 5
                }
            }
        )
    });

    it('should be able to transform in', async function () {
        let query_validator = query_validator_from_zod(z.object({
            param: z.string(),
        }))

        assert.deepEqual(
            query_object_to_mongodb_query(query_validator.parse({
                param_in: 'test1,test2,test3'
            })),
            {
                param: {
                    $in: ['test1', 'test2', 'test3']
                }
            }
        )
    });

    it('should be able to discard controllers', async function () {
        let query_validator = query_validator_from_zod(z.object({
            param: z.number(),
        }))

        assert.deepEqual(
            query_object_to_mongodb_query(query_validator.parse({
                param: '5',
                limit: 6,
                cursor: '6894cba684185cb03275d511',
                sort: 'param',
                sort_order: 'descending'
            })),
            {
                param: 5
            }
        )
    });
    
    it('should be able to extract sort metadata', async function () {
        let query_validator = query_validator_from_zod(z.object({
            param: z.number(),
        }))

        let query = new Query_Mock();

        //@ts-expect-error
        query_object_to_mongodb_limits(query, query_validator.parse({
            param: '5',
            sort: 'param',
        }));

        assert.deepEqual(
            query.filter,
            {}
        )

        assert.deepEqual(
            query.meta,
            {
                limit: 100,
                sort: {
                    param: 'ascending'
                }
            }
        )
    });

    it('should be able to extract sort metadata with a sort order', async function () {
        let query_validator = query_validator_from_zod(z.object({
            param: z.number(),
        }))

        let query = new Query_Mock();

        //@ts-expect-error
        query_object_to_mongodb_limits(query, query_validator.parse({
            param: '5',
            sort: 'param',
            sort_order: 'descending'
        }));

        assert.deepEqual(
            query.filter,
            {}
        )

        assert.deepEqual(
            query.meta,
            {
                limit: 100,
                sort: {
                    param: 'descending'
                }
            }
        )
    });

    
    it('should sort by ID if given a sort order without a sort field', async function () {
        let query_validator = query_validator_from_zod(z.object({
            param: z.number(),
        }))

        let query = new Query_Mock();

        //@ts-expect-error
        query_object_to_mongodb_limits(query, query_validator.parse({
            param: '5',
            sort_order: 'descending'
        }));

        assert.deepEqual(
            query.filter,
            {}
        )

        assert.deepEqual(
            query.meta,
            {
                limit: 100,
                sort: {
                    _id: 'descending'
                }
            }
        )
    });

    it('should be able to extract limit metadata', async function () {
        let query_validator = query_validator_from_zod(z.object({
            param: z.number(),
        }))

        let query = new Query_Mock();

        //@ts-expect-error
        query_object_to_mongodb_limits(query, query_validator.parse({
            param: '5',
            limit: '5',
        }));

        assert.deepEqual(
            query.filter,
            {}
        )

        assert.deepEqual(
            query.meta,
            {
                limit: 5
            }
        )
    });

    it('should default to sane limits', async function () {
        let query_validator = query_validator_from_zod(z.object({
            param: z.number(),
        }))

        let query = new Query_Mock();

        //@ts-expect-error
        query_object_to_mongodb_limits(query, query_validator.parse({
            param: '5',
            limit: '5000',
        }));

        assert.deepEqual(
            query.filter,
            {}
        )

        assert.deepEqual(
            query.meta,
            {
                limit: 100
            }
        )
    });

    it('should filter by ID when using a cursor', async function () {
        let query_validator = query_validator_from_zod(z.object({
            param: z.number(),
        }))

        let query = new Query_Mock();

        //@ts-expect-error
        query_object_to_mongodb_limits(query, query_validator.parse({
            param: '5',
            cursor: '6894cba684185cb03275d511',
        }));

        assert.deepEqual(
            query.filter,
            {
                _id: {
                    $gt: '6894cba684185cb03275d511'
                }
            }
        )

        assert.deepEqual(
            query.meta,
            {
                limit: 100,
                sort: {
                    _id: 'ascending'
                }
            }
        )
    });
});