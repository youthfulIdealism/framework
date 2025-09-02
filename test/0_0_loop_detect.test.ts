import assert from "assert";
import { z, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'

import { find_loops } from '../dist/utils/zod_loop_seperator.js';
import { Schema } from 'mongoose'
import { required } from "zod/mini";

process.env.DEBUG = 'express:*'

describe('Mongoose from Zod', function () {

    it('should detect no loops in an empty object', function () {
        let zodSchema = z.object({ })
        let loops = find_loops(zodSchema);
        assert.equal(loops.size, 0)
    });

    it('should detect a loop if one exists', function () {
        let zodSchema = z.object({ 
            val: z.string(),
            get looped() {
                return zodSchema
            }
        })
        let loops = find_loops(zodSchema);
        assert.equal(loops.size, 1)
    });

    it('should detect multiple loops if they exist', function () {

        let looped_1 = z.object({ 
            val: z.string(),
            get looped_1() {
                return looped_1;
            }
        })

        let looped_2 = z.object({ 
            val: z.string(),
            get looped_2() {
                return looped_2;
            }
        })
        let loops = find_loops(z.object({
            looped_1: looped_1,
            looped_2: looped_2,
        }));
        assert.equal(loops.size, 2)
    });

    it('should detect loops within arrays', function () {
        let zodSchema = z.object({ 
            val: z.string(),
            get looped() {
                return z.array(zodSchema)
            }
        })
        let loops = find_loops(zodSchema);
        assert.equal(loops.size, 1)
    });

    it('should detect loops within nullable', function () {
        let zodSchema = z.object({ 
            val: z.string(),
            get looped() {
                return z.nullable(zodSchema)
            }
        })
        let loops = find_loops(zodSchema);
        assert.equal(loops.size, 1)
    });

    it('should detect loops within optional', function () {
        let zodSchema = z.object({ 
            val: z.string(),
            get looped() {
                return z.optional(zodSchema)
            }
        })
        let loops = find_loops(zodSchema);
        assert.equal(loops.size, 1)
    });

    it('should detect loops within default', function () {
        let zodSchema = z.object({ 
            val: z.string(),
            get looped() {
                //@ts-ignore
                return zodSchema.default({val: 'test', looped: undefined})
            }
        })
        let loops = find_loops(zodSchema);
        assert.equal(loops.size, 1)
    });

    it('should detect loops within record', function () {
        let zodSchema = z.object({ 
            val: z.string(),
            get looped() {
                return z.record(z.string(), zodSchema)
            }
        })
        let loops = find_loops(zodSchema);
        assert.equal(loops.size, 1)
    });

    it('should detect loops within union', function () {
        let zodSchema = z.object({ 
            val: z.string(),
            get looped() {
                return z.string().or(zodSchema)
            }
        })
        let loops = find_loops(zodSchema);
        assert.equal(loops.size, 1)
    });
});