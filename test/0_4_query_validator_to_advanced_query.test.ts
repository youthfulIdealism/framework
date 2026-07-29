import assert from "assert";
import { z } from 'zod'

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { complex_query_validator_from_zod } from '../dist/utils/complex_query_validator_from_zod.js';

describe('query validator to advanced query', function () {

    it('advanced queries should fail if they get bad data', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            enum: z.enum(['one', 'two']),
        }))

        assert.throws(() => {
            query_validator.parse({
                test: 'bad'
            })
        })
    });

    it('advanced queries should be able to parse ands', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
        }))

        query_validator.parse({
            $and:[]
        })
    });

    it('advanced queries should be able to parse ors', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
        }))

        query_validator.parse({
            $or:[]
        })
    });

    it('advanced queries should be able to parse enum $eq', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            enum: z.enum(['one', 'two']),
        }))

        query_validator.parse({
            $and:[{
                enum: {
                    $eq: 'one'
                }
            }]
        })
    });

    it('advanced queries should be able to parse enum $in', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            enum: z.enum(['one', 'two']),
        }))

        query_validator.parse({
            $and:[{
                enum: {
                    $in: ['one', 'two']
                }
            }]
        })
    });

    it('advanced queries should be able to parse boolean $eq', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            bool: z.boolean(),
        }))

        query_validator.parse({
            $and:[{
                bool: {
                    $eq: true
                }
            }]
        })
    });

    it('advanced queries should be able to parse number $eq', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            num: z.number(),
        }))

        query_validator.parse({
            $and:[{
                num: {
                    $eq: 5
                }
            }]
        })
    });

    it('advanced queries should be able to parse number $lt', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            num: z.number(),
        }))

        query_validator.parse({
            $and:[{
                num: {
                    $lt: 5
                }
            }]
        })
    });

    it('advanced queries should be able to parse number $gt', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            num: z.number(),
        }))

        query_validator.parse({
            $and:[{
                num: {
                    $gt: 5
                }
            }]
        })
    });

    it('advanced queries should be able to parse number $lte', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            num: z.number(),
        }))

        query_validator.parse({
            $and:[{
                num: {
                    $lte: 5
                }
            }]
        })
    });

    it('advanced queries should be able to parse number $gte', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            num: z.number(),
        }))

        query_validator.parse({
            $and:[{
                num: {
                    $gte: 5
                }
            }]
        })
    });

    it('advanced queries should be able to parse date $eq', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            date: z.date(),
        }))

        query_validator.parse({
            $and:[{
                date: {
                    $eq: new Date()
                }
            }]
        })
    });

    it('advanced queries should be able to parse date $gt', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            date: z.date(),
        }))

        query_validator.parse({
            $and:[{
                date: {
                    $gt: new Date()
                }
            }]
        })
    });

    it('advanced queries should be able to parse date $lt', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            date: z.date(),
        }))

        query_validator.parse({
            $and:[{
                date: {
                    $lt: new Date()
                }
            }]
        })
    });

    it('advanced queries should be able to parse date $gte', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            date: z.date(),
        }))

        query_validator.parse({
            $and:[{
                date: {
                    $gte: new Date()
                }
            }]
        })
    });

    it('advanced queries should be able to parse date $lte', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            date: z.date(),
        }))

        query_validator.parse({
            $and:[{
                date: {
                    $lte: new Date()
                }
            }]
        })
    });

    it('advanced queries should be able to parse coerce date $eq', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            date: z.coerce.date()
        }))

        query_validator.parse({
            $and:[{
                date: {
                    $eq: new Date().toISOString()
                }
            }]
        })
    });

    it('advanced queries should be able to parse coerce date $gt', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            date: z.coerce.date()
        }))

        query_validator.parse({
            $and:[{
                date: {
                    $gt: new Date().toISOString()
                }
            }]
        })
    });

    it('advanced queries should be able to parse coerce date $lt', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            date: z.coerce.date()
        }))

        query_validator.parse({
            $and:[{
                date: {
                    $lt: new Date().toISOString()
                }
            }]
        })
    });

    it('advanced queries should be able to parse coerce date $gte', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            date: z.coerce.date()
        }))

        query_validator.parse({
            $and:[{
                date: {
                    $gte: new Date().toISOString()
                }
            }]
        })
    });

    it('advanced queries should be able to parse coerce date $lte', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            date: z.coerce.date()
        }))

        query_validator.parse({
            $and:[{
                date: {
                    $lte: new Date().toISOString()
                }
            }]
        })
    });

    it('advanced queries should be able to parse mongodb id $eq', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            _id: z_mongodb_id
        }))

        query_validator.parse({
            $and:[{
                _id: {
                    $eq: '697b80da5a78eb5b841ad72f'
                }
            }]
        })
    });

    it('advanced queries should be able to parse mongodb id $gt', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            _id: z_mongodb_id
        }))

        query_validator.parse({
            $and:[{
                _id: {
                    $gt: '697b80da5a78eb5b841ad72f'
                }
            }]
        })
    });

    it('advanced queries should be able to parse mongodb id $lt', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            _id: z_mongodb_id
        }))

        query_validator.parse({
            $and:[{
                _id: {
                    $lt: '697b80da5a78eb5b841ad72f'
                }
            }]
        })
    });

    it('advanced queries should be able to parse mongodb id $gte', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            _id: z_mongodb_id
        }))

        query_validator.parse({
            $and:[{
                _id: {
                    $gte: '697b80da5a78eb5b841ad72f'
                }
            }]
        })
    });

    it('advanced queries should be able to parse mongodb id $lte', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            _id: z_mongodb_id
        }))

        query_validator.parse({
            $and:[{
                _id: {
                    $lte: '697b80da5a78eb5b841ad72f'
                }
            }]
        })
    });

    it('advanced queries should be able to parse mongodb id $in', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            _id: z_mongodb_id
        }))

        query_validator.parse({
            $and:[{
                _id: {
                    $in: ['697b80da5a78eb5b841ad72f']
                }
            }]
        })
    });

    it('advanced queries should be able to parse mongodb id $nin', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            _id: z_mongodb_id
        }))

        query_validator.parse({
            $and:[{
                _id: {
                    $nin: ['697b80da5a78eb5b841ad72f']
                }
            }]
        })
    });

    it('advanced query fields should be optional', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            _id: z_mongodb_id,
            enum: z.enum(['one', 'two']),
            bool: z.boolean(),
            num: z.number(),
            date: z.date(),
        }))

        query_validator.parse({
            $and:[]
        })
    });

    it('advanced queries should be able to parse string $eq', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            param: z.string(),
        }))

        query_validator.parse({
            $and:[{
                param: {
                    $eq: 'fungus'
                }
            }]
        })
    });

    it('advanced queries should be able to parse string $in', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            param: z.string(),
        }))

        query_validator.parse({
            $and:[{
                param: {
                    $in: ['fungus', 'yeast']
                }
            }]
        })
    });

    it('advanced queries should be able to parse string $nin', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            param: z.string(),
        }))

        query_validator.parse({
            $and:[{
                param: {
                    $nin: ['fungus', 'yeast']
                }
            }]
        })
    });

    it('advanced queries should be able to parse string $regex and escape it', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            param: z.string(),
        }))

        let parsed = query_validator.parse({
            $and:[{
                param: {
                    $regex: 'den.*'
                }
            }]
        }) as any;

        assert.equal(parsed.$and[0].param.$regex, 'den\\.\\*');
    });

    it('advanced queries should throw if a string filter receives a bad operator value', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            param: z.string(),
        }))

        assert.throws(() => {
            query_validator.parse({
                $and:[{
                    param: {
                        $eq: 5
                    }
                }]
            })
        })
    });

    it('advanced queries should be able to parse a union type', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            param: z.string().or(z.number()),
        }))

        query_validator.parse({
            $and:[{
                param: 'fungus'
            }]
        })

        query_validator.parse({
            $and:[{
                param: 5
            }]
        })
    });

    it('advanced queries should be able to parse an array of strings using the same filter as a plain string', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            tags: z.array(z.string()),
        }))

        query_validator.parse({
            $and:[{
                tags: {
                    $in: ['a', 'b']
                }
            }]
        })
    });

    it('advanced queries should be able to parse an array of mongodb IDs using the same filter as a plain mongodb ID', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            tag_ids: z.array(z_mongodb_id),
        }))

        query_validator.parse({
            $and:[{
                tag_ids: {
                    $in: ['697b80da5a78eb5b841ad72f']
                }
            }]
        })
    });

    it('advanced queries should be able to parse a nested field', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            nest: z.object({
                parameter: z.string(),
            }),
        }))

        query_validator.parse({
            $and:[{
                'nest.parameter': {
                    $eq: 'fungus'
                }
            }]
        })
    });

    it('advanced queries should be able to parse an $or with real filter content', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            enum: z.enum(['one', 'two']),
        }))

        query_validator.parse({
            $or:[
                { enum: { $eq: 'one' } },
                { enum: { $eq: 'two' } },
            ]
        })
    });

    it('advanced queries should be able to parse an $and nested inside an $or', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            enum: z.enum(['one', 'two']),
            num: z.number(),
        }))

        query_validator.parse({
            $or:[
                { $and: [{ enum: { $eq: 'one' } }, { num: { $gt: 1 } }] },
                { enum: { $eq: 'two' } },
            ]
        })
    });

    it('advanced queries should silently strip a field that is not part of the schema, unlike the basic query validator', async function () {
        let query_validator = complex_query_validator_from_zod(z.object({
            enum: z.enum(['one', 'two']),
        }))

        let parsed = query_validator.parse({
            $and:[{
                enum: { $eq: 'one' },
                unknown_field: { $eq: 'x' },
            }]
        }) as any;

        assert.deepEqual(parsed.$and[0], { enum: { $eq: 'one' } });
    });

    it('advanced queries should exclude every field of a directly self-referential schema, not just the recursive field', async function () {
        let recursive_schema: any = z.object({
            name: z.string(),
            get looped() {
                return recursive_schema;
            }
        })

        let query_validator = complex_query_validator_from_zod(recursive_schema);

        let parsed = query_validator.parse({
            $and:[{
                name: { $eq: 'fungus' },
                looped: { $eq: 'ignored' },
            }]
        }) as any;

        // find_loops flags the recurring object def itself (confirmed by 0_0_loop_detect.test.ts: a
        // directly self-referential root has loops.size === 1, that one entry being the root's own
        // def), so the top-level parse_object call excludes every field here, not just "looped".
        assert.deepEqual(parsed.$and[0], {});
    });
});