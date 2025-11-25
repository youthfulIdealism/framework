import assert from "assert";
import { z, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'

import { array_children_from_zod } from '../dist/utils/array_children_from_zod.js';
import { Schema } from 'mongoose'
import { required } from "zod/mini";

process.env.DEBUG = 'express:*'

describe.only('Mongoose from Zod', function () {
    it('should detect no loops in an empty object', function () {
        let zodSchema = z.object({ })
        let array_children = array_children_from_zod(zodSchema);
        assert.equal(array_children.size, 0)
    });

    it('should detect an array child if one exists', function () {
        let zodSchema = z.object({ 
            val: z.array(z.object({
                test: z.string()
            }))
        })
        let array_children = array_children_from_zod(zodSchema);
        assert.equal(array_children.size, 1)
    });

    it('should detect multiple array children if they exist', function () {

        let zodSchema = z.object({ 
            val: z.array(z.object({
                test: z.string()
            })),
            other_val: z.array(z.object({
                test: z.string()
            }))
        })
        let array_children = array_children_from_zod(zodSchema);
        assert.equal(array_children.size, 2)
    });

    it('should detect array children within nullable', function () {
        let zodSchema = z.object({ 
            val: z.nullable(z.array(z.object({
                test: z.string()
            })))
        })
        let array_children = array_children_from_zod(zodSchema);
        assert.equal(array_children.size, 1)
    });

    it('should detect array children within optional', function () {
        let zodSchema = z.object({ 
            val: z.optional(z.array(z.object({
                test: z.string()
            })))
        })
        let array_children = array_children_from_zod(zodSchema);
        assert.equal(array_children.size, 1)
    });

    it('should detect array children nested within an object', function () {
        let zodSchema = z.object({ 
            alpha: z.object({
                val: z.array(z.object({
                    test: z.string()
                }))
            })
        })
        let array_children = array_children_from_zod(zodSchema);
        assert.equal(array_children.size, 1)
    });

    it('should have correct array children and nested array children names', function () {
        let zodSchema = z.object({ 
            alpha: z.object({
                val: z.array(z.object({
                    test: z.string()
                }))
            }),
            latex: z.array(z.object({
                    test: z.string()
                }))
        })
        let array_children = array_children_from_zod(zodSchema);
        assert.equal(Array.from(array_children.keys()).includes('alpha.val'), true);
        assert.equal(Array.from(array_children.keys()).includes('latex'), true);
    });

    it('should return the validator for a child', function () {
        let zodSchema = z.object({ 
            val: z.array(z.object({
                test: z.string()
            }))
        })
        let array_children = array_children_from_zod(zodSchema);
        assert.deepEqual(array_children.get('val')?.parse({test: 'testval'}), {test: 'testval'})
    });
});