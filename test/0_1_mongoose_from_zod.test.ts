import assert from "assert";
import { z, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'

import { schema_from_zod, z_mongodb_id, z_mongodb_id_nullable, z_mongodb_id_optional } from '../dist/utils/mongoose_from_zod.js';
import { Schema } from 'mongoose'
import { required } from "zod/mini";

process.env.DEBUG = 'express:*'

describe('Mongoose from Zod', function () {

    it('should convert an empty object', function () {
        let zodSchema = z.object({ })
        let mongooseSchema = schema_from_zod(zodSchema)
        assert.deepEqual({}, mongooseSchema)
    });

    let basic_types = [{
            label: 'string',
            mongoose_type: String,
            zod_function: z.string,
            default_val: 'todd',
        }, {
            label: 'number',
            mongoose_type: Number,
            zod_function: z.number,
            default_val: 42,
        }, {
            label: 'boolean',
            mongoose_type: Boolean,
            zod_function: z.boolean,
            default_val: true,
        }, {
            label: 'date',
            mongoose_type: Date,
            zod_function: z.date,
            default_val: new Date().toISOString(),
        }, {
            label: 'objectid',
            mongoose_type: Schema.Types.ObjectId,
            zod_function: () => z_mongodb_id,
            default_val: '65add375755c5e0415b69803',
        }
    ]

    /*
        Basic type conversions
    */
    for(let basic_type of basic_types) {
        it(`should convert ${basic_type.label} to mongoose type`, function () {
            let zodSchema = z.object({ test_value: basic_type.zod_function() })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: { mongoose_type: basic_type.mongoose_type, required: true } }, mongooseSchema)
        });

        it(`should convert ${basic_type.label} to mongoose type with optional`, function () {
            let zodSchema = z.object({ test_value: basic_type.zod_function().optional() })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: { mongoose_type: basic_type.mongoose_type, required: false } }, mongooseSchema)
        });

        it(`should convert ${basic_type.label} to mongoose type with default values`, function () {
            //@ts-ignore
            let zodSchema = z.object({ test_value: basic_type.zod_function().default(basic_type.default_val) })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: { mongoose_type: basic_type.mongoose_type, required: true, default: basic_type.default_val } }, mongooseSchema)
        });

        it(`should convert ${basic_type.label} to mongoose type with nullable`, function () {
            let zodSchema = z.object({ test_value: basic_type.zod_function().nullable() })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: { mongoose_type: basic_type.mongoose_type, required: true } }, mongooseSchema)
        });

        it(`should convert ${basic_type.label} to mongoose type with optional AND default values`, function () {
            //@ts-ignore
            let zodSchema = z.object({ test_value: basic_type.zod_function().default(basic_type.default_val).optional() })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: { mongoose_type: basic_type.mongoose_type, required: false, default: basic_type.default_val } }, mongooseSchema)
        });
    }

    /*
        nested type conversions
    */
    for(let basic_type of basic_types) {
        it(`should convert a nested object containing a ${basic_type.label} property to mongoose type`, function () {
            let zodSchema = z.object({ test_value: z.object({test_value: basic_type.zod_function() }) })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: { mongoose_type: {test_value: { mongoose_type: basic_type.mongoose_type, required: true }}, required: true} }, mongooseSchema)
        });

        it(`should convert a nested object containing a ${basic_type.label} property to mongoose type with optional`, function () {
            let zodSchema = z.object({ test_value: z.object({test_value: basic_type.zod_function().optional() }) })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: { mongoose_type: {test_value: { mongoose_type: basic_type.mongoose_type, required: false }}, required: true } }, mongooseSchema)
        });

        it(`should convert a nested object containing a ${basic_type.label} property to mongoose type with default values`, function () {
            //@ts-ignore
            let zodSchema = z.object({ test_value: z.object({test_value: basic_type.zod_function().default(basic_type.default_val) }) })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: { mongoose_type: {test_value: {  mongoose_type: basic_type.mongoose_type, required: true, default: basic_type.default_val }}, required: true } }, mongooseSchema)
        });
    }

    /*
        array type conversions
    */
    for(let basic_type of basic_types) {
        it(`should convert ${basic_type.label} array to mongoose type`, function () {
            let zodSchema = z.object({ test_value: z.array(basic_type.zod_function()) })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: {mongoose_type: [{ mongoose_type: basic_type.mongoose_type, required: true }], required: true} }, mongooseSchema)
        });

        it(`should convert ${basic_type.label} array to mongoose type with optional`, function () {
            let zodSchema = z.object({ test_value: z.array(basic_type.zod_function()).optional() })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: {mongoose_type: [{ mongoose_type: basic_type.mongoose_type, required: true }], required: false} }, mongooseSchema)
        });

        it(`should convert ${basic_type.label} array to mongoose type with default values`, function () {
            let zodSchema = z.object({ test_value: z.array(basic_type.zod_function()).default([]) })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: {mongoose_type: [{ mongoose_type: basic_type.mongoose_type, required: true }], required: true, default: []} }, mongooseSchema)
        });
    }

    /*
        array inside an object conversions
    */
    for(let basic_type of basic_types) {
        it(`should convert ${basic_type.label} array to mongoose type`, function () {
            let zodSchema = z.object({ test_value: z.array(basic_type.zod_function()) })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: {mongoose_type: [{ mongoose_type: basic_type.mongoose_type, required: true }], required: true} }, mongooseSchema)
        });

        it(`should convert ${basic_type.label} array to mongoose type with optional`, function () {
            let zodSchema = z.object({ test_value: z.array(basic_type.zod_function()).optional() })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: {mongoose_type: [{ mongoose_type: basic_type.mongoose_type, required: true }], required: false} }, mongooseSchema)
        });

        it(`should convert ${basic_type.label} array to mongoose type with default values`, function () {
            let zodSchema = z.object({ test_value: z.array(basic_type.zod_function()).default([]) })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: {mongoose_type: [{ mongoose_type: basic_type.mongoose_type, required: true }], required: true, default: []} }, mongooseSchema)
        });
    }

    /*
        map conversions
    */
    for(let basic_type of basic_types) {
        it(`should convert record of ${basic_type.label} to mongoose type`, function () {
            let zodSchema = z.object({ test_value: z.record(z.string(), basic_type.zod_function()) })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: {mongoose_type: Schema.Types.Map, of: { mongoose_type: basic_type.mongoose_type, required: true }, required: true} }, mongooseSchema)
        });

        it(`should convert record of ${basic_type.label} to mongoose type with optional`, function () {
            let zodSchema = z.object({ test_value: z.record(z.string(), basic_type.zod_function()).optional() })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: {mongoose_type: Schema.Types.Map, of: { mongoose_type: basic_type.mongoose_type, required: true }, required: false} }, mongooseSchema)
        });

        it(`should convert record of ${basic_type.label} to mongoose type with default values`, function () {
            //@ts-ignore
            let zodSchema = z.object({ test_value: z.record(z.string(), basic_type.zod_function()).default({}) })
            let mongooseSchema = schema_from_zod(zodSchema)
            assert.deepEqual({ test_value: {mongoose_type: Schema.Types.Map, of: { mongoose_type: basic_type.mongoose_type, required: true }, required: true, default: {}} }, mongooseSchema)
        });
    }

    /*
        special ID handling
    */

    it(`should correctly handle nullable mongodb IDs`, function () {
        let zodSchema = z.object({ test_value: z_mongodb_id_nullable})
        let mongooseSchema = schema_from_zod(zodSchema)
        assert.deepEqual({ test_value: {mongoose_type: Schema.Types.ObjectId, required: false} }, mongooseSchema)
    });

    it(`should correctly handle optional mongodb IDs`, function () {
        let zodSchema = z.object({ test_value: z_mongodb_id_optional })
        let mongooseSchema = schema_from_zod(zodSchema)
        assert.deepEqual({ test_value: {mongoose_type: Schema.Types.ObjectId, required: false} }, mongooseSchema)
    });

    /*
        enum conversions
    */


    it(`should convert enums to mongoose type`, function () {
        let zodSchema = z.object({ test_value: z.enum(['chunky', 'funky', 'monkey']) })
        let mongooseSchema = schema_from_zod(zodSchema)
        assert.deepEqual({ test_value: {mongoose_type: String, required: true} }, mongooseSchema)
    });

    it(`should convert enums to mongoose type with optional`, function () {
        let zodSchema = z.object({ test_value: z.enum(['chunky', 'funky', 'monkey']).optional() })
        let mongooseSchema = schema_from_zod(zodSchema)
        assert.deepEqual({ test_value: {mongoose_type: String, required: false} }, mongooseSchema)
    });

    it(`should convert enums to mongoose type with default values`, function () {
        let zodSchema = z.object({ test_value: z.enum(['chunky', 'funky', 'monkey']).default('chunky') })
        let mongooseSchema = schema_from_zod(zodSchema)
        assert.deepEqual({ test_value: {mongoose_type: String, required: true, default: 'chunky'} }, mongooseSchema)
    });

    it(`should convert union types to a mixed schema`, function () {
        let zodSchema = z.object({
            test_value: z.number().or(z.string())
        })
        let mongooseSchema = schema_from_zod(zodSchema)
        assert.deepEqual({ test_value: {mongoose_type: Schema.Types.Mixed, required: true} }, mongooseSchema)
    });

    it(`should convert union types to a mixed schema with default values`, function () {
        let zodSchema = z.object({
            test_value: z.number().or(z.string()).default(2)
        })
        let mongooseSchema = schema_from_zod(zodSchema)
        assert.deepEqual({ test_value: {mongoose_type: Schema.Types.Mixed, required: true, default: 2} }, mongooseSchema)
    });

    it(`should convert union types to a mixed schema with optional`, function () {
        let zodSchema = z.object({
            test_value: z.number().or(z.string()).optional()
        })
        let mongooseSchema = schema_from_zod(zodSchema)
        assert.deepEqual({ test_value: {mongoose_type: Schema.Types.Mixed, required: false} }, mongooseSchema)
    });

    it(`should convert recursive schemas`, function () {
        let recursive_child = z.object({
            type: z.enum(['group']),
            operator: z.enum(['all', 'any']),
            get children() {
                return z.array(recursive_child)
            },
            locked: z.boolean().optional()
        })

        let zodSchema = z.object({
            children: z.array(recursive_child)
        })
        let mongooseSchema = schema_from_zod(zodSchema)

        assert.deepEqual({
            children: {mongoose_type: [{mongoose_type: Schema.Types.Mixed, required: true}], required: true },
        }, mongooseSchema)
    })

    it(`should not treat similar schemas as recursive`, function () {
        let zodSchema = z.object({
            a: z.object({
                name: z.string()
            }),
            b: z.object({
                name: z.string()
            }),
            c: z.object({
                name: z.string()
            }),
        })
        let mongooseSchema = schema_from_zod(zodSchema)

        assert.deepEqual({ 
            a: { mongoose_type: { name: { mongoose_type: String, required: true } }, required: true },
            b: { mongoose_type: { name: { mongoose_type: String, required: true } }, required: true },
            c: { mongoose_type: { name: { mongoose_type: String, required: true } }, required: true },
        }, mongooseSchema)
    })
});