import assert from "assert";
import { boolean, z, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { query_validator_from_zod } from '../dist/utils/query_validator_from_zod.js';
import { Schema } from 'mongoose'

import { Cache } from '../dist/utils/cache.js'

describe('query validator from zod', function () {
    it('should be able to turn an empty zod object into an empty validator', async function () {
        let query_validator = query_validator_from_zod(z.object({}))
        assert.deepEqual(
            query_validator.parse({}),
            {}
        )
    });

    it('should be able to process all the default arguments', async function () {
        let query_validator = query_validator_from_zod(z.object({}))
        assert.deepEqual(
            query_validator.parse({
                limit: 5,
                cursor: '6894cba684185cb03275d511',
                sort_order: 'asc',
            }),
            {
                limit: 5,
                cursor: '6894cba684185cb03275d511',
                sort_order: 'asc',
            }
        )
    });

    it('should throw an error on uncalled-for inputs', async function () {
        let query_validator = query_validator_from_zod(z.object({}))
        assert.throws(() => {
            query_validator.parse({
                bad_input: 'bad input',
            })
        })
    });

    it('should be able to process a mongodb_id with greater than and less than', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                parameter: z_mongodb_id
            })
        );

        assert.deepEqual(
            query_validator.parse({
                parameter: '6894cba684185cb03275d511',
                parameter_gt: '6894cba684185cb03275d511',
                parameter_lt: '6894cba684185cb03275d511',
            }),
            {
                parameter: '6894cba684185cb03275d511',
                parameter_gt: '6894cba684185cb03275d511',
                parameter_lt: '6894cba684185cb03275d511',
            }
        );
    });

    it('should be able to process a mongodb_id as a member of an array', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                parameter: z_mongodb_id
            })
        );

        assert.deepEqual(
            query_validator.parse({
                parameter_in: '6894cba684185cb03275d511,689510e2c345ab6dd1075266,689510e2c345ab6dd1075268',
            }),
            {
                parameter_in: ['6894cba684185cb03275d511', '689510e2c345ab6dd1075266', '689510e2c345ab6dd1075268'],
            }
        );
    });


    it('should error out if passed an invalid mongodb id', async function () {
        let query_validator = query_validator_from_zod(z.object({}))
        assert.throws(() => {
            query_validator.parse({
                cursor: 'bad id',
            })
        })
    });

    it('should be able to process a string, string greater than, and string less than', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                parameter: z.string()
            })
        );

        assert.deepEqual(
            query_validator.parse({
                parameter: 'fungus',
                parameter_gt: 'fungus',
                parameter_lt: 'fungus',
            }),
            {
                parameter: 'fungus',
                parameter_gt: 'fungus',
                parameter_lt: 'fungus',
            }
        );
    });

    it('should be able to process string membership in an array', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                parameter: z.string()
            })
        );

        assert.deepEqual(
            query_validator.parse({
                parameter_in: 'fungus,yeast,mold',
            }),
            {
                parameter_in: ['fungus', 'yeast', 'mold'],
            }
        );
    });

    it('should be able to process a boolean', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                parameter: z.boolean()
            })
        );

        assert.deepEqual(
            query_validator.parse({
                parameter: 'false',
            }),
            {
                parameter: false,
            }
        );
    });

    it('should be able to process a number with greater than, greater than or equal to, less than, less than or equal to', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                parameter: z.number()
            })
        );

        assert.deepEqual(
            query_validator.parse({
                parameter: '42',
                parameter_gt: '42',
                parameter_gte: '42',
                parameter_lt: '42',
                parameter_lte: '42',
            }),
            {
                parameter: 42,
                parameter_gt: 42,
                parameter_gte: 42,
                parameter_lt: 42,
                parameter_lte: 42,
            }
        );
    });

    it('should be able to process a date with greater than and less than', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                parameter: z.date()
            })
        );

        let date = new Date().toISOString();

        assert.deepEqual(
            query_validator.parse({
                parameter: date,
                parameter_gt: date,
                parameter_lt: date,
            }),
            {
                parameter: new Date(date),
                parameter_gt: new Date(date),
                parameter_lt: new Date(date),
            }
        );
    });

    it('should be able to process a number in an array', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                parameter: z.array(z.number())
            })
        );

        assert.deepEqual(
            query_validator.parse({
                parameter: '42',
            }),
            {
                parameter: 42,
            }
        );
    });

    it('should be able to process a string in an array', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                parameter: z.array(z.string())
            })
        );

        assert.deepEqual(
            query_validator.parse({
                parameter: 'algebra',
            }),
            {
                parameter: 'algebra',
            }
        );
    });

    it('should be able to process an enum in an array', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                parameter: z.array(z.enum(['red', 'blue']))
            })
        );

        assert.deepEqual(
            query_validator.parse({
                parameter: 'red',
            }),
            {
                parameter: 'red',
            }
        );
    });

    it('should be able to process a boolean in an array', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                parameter: z.array(z.boolean())
            })
        );

        assert.deepEqual(
            query_validator.parse({
                parameter: 'true',
            }),
            {
                parameter: true,
            }
        );
    });

    it('should be able to process a mongodb in an array', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                parameter: z.array(z_mongodb_id)
            })
        );

        assert.deepEqual(
            query_validator.parse({
                parameter: '6894cba684185cb03275d511',
            }),
            {
                parameter: '6894cba684185cb03275d511',
            }
        );
    });

    it('should be able to process a nested value', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                nest: z.object({
                    parameter: z.string()
                })
                
            })
        );

        assert.deepEqual(
            query_validator.parse({
                'nest.parameter': 'fungus'
            }),
            {
                'nest.parameter': 'fungus'
            }
        );
    });

    it('should be able to process a deeply nested value', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                nest: z.object({
                    egg: z.object({
                        parameter: z.string()
                    })
                })
                
            })
        );

        assert.deepEqual(
            query_validator.parse({
                'nest.egg.parameter': 'fungus'
            }),
            {
                'nest.egg.parameter': 'fungus'
            }
        );
    });

     it('should be able to process a deeply nested array value', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                nest: z.object({
                    egg: z.object({
                        parameter: z.array(z.string())
                    })
                })
                
            })
        );

        assert.deepEqual(
            query_validator.parse({
                'nest.egg.parameter': 'fungus'
            }),
            {
                'nest.egg.parameter': 'fungus'
            }
        );
    });
    
    it('should allow for sorting any sortable field', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                mongodb_parameter: z_mongodb_id,
                date_parameter: z.date(),
                number_parameter: z.number(),
                boolean_parameter: z.boolean(),
                string_parameter: z.string(),
            })
        );

        assert.deepEqual(
            query_validator.parse({
                sort: 'mongodb_parameter',
            }),
            {
                sort: 'mongodb_parameter',
            }
        );

        assert.deepEqual(
            query_validator.parse({
                sort: 'mongodb_parameter',
            }),
            {
                sort: 'mongodb_parameter',
            }
        );

        assert.deepEqual(
            query_validator.parse({
                sort: 'date_parameter',
            }),
            {
                sort: 'date_parameter',
            }
        );

        assert.deepEqual(
            query_validator.parse({
                sort: 'boolean_parameter',
            }),
            {
                sort: 'boolean_parameter',
            }
        );

        assert.deepEqual(
            query_validator.parse({
                sort: 'string_parameter',
            }),
            {
                sort: 'string_parameter',
            }
        );
    });

    it('should allow for sorting any nested sortable field', async function () {
        let query_validator = query_validator_from_zod(
            z.object({
                nested: z.object({
                    mongodb_parameter: z_mongodb_id,
                    date_parameter: z.date(),
                    number_parameter: z.number(),
                    boolean_parameter: z.boolean(),
                    string_parameter: z.string(),
                })
            })
        );

        assert.deepEqual(
            query_validator.parse({
                sort: 'nested.mongodb_parameter',
            }),
            {
                sort: 'nested.mongodb_parameter',
            }
        );

        assert.deepEqual(
            query_validator.parse({
                sort: 'nested.mongodb_parameter',
            }),
            {
                sort: 'nested.mongodb_parameter',
            }
        );

        assert.deepEqual(
            query_validator.parse({
                sort: 'nested.date_parameter',
            }),
            {
                sort: 'nested.date_parameter',
            }
        );

        assert.deepEqual(
            query_validator.parse({
                sort: 'nested.boolean_parameter',
            }),
            {
                sort: 'nested.boolean_parameter',
            }
        );

        assert.deepEqual(
            query_validator.parse({
                sort: 'nested.string_parameter',
            }),
            {
                sort: 'nested.string_parameter',
            }
        );
    });




});