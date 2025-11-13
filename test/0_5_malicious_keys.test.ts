import assert from "assert";
import { z, ZodBoolean, ZodDate, ZodNumber, ZodString } from 'zod'

import { detect_malicious_keys } from '../dist/utils/mongoose_any_paths.js';


import { Schema } from 'mongoose'
import { required } from "zod/mini";

process.env.DEBUG = 'express:*'

describe('malcious key detection', function () {
    it('should pass if there are no malicious keys', function () {
        detect_malicious_keys({})
    });

    it('should throw if there is a malicious key', function () {
        assert.throws(() => {
            detect_malicious_keys({
                $set: 5
            })
        })
    });

    it('should throw if there is a malicious key embedded as an array child', function () {
        assert.throws(() => {
            detect_malicious_keys({
                array: [
                    {$set: 6}
                ]
            })
        })
    });

    it('should throw if there is a malicious key embedded as a sub-item', function () {
        assert.throws(() => {
            detect_malicious_keys({
                obj: {$set: 6}
            })
        })
    });

    it('should throw if there is a malicious key embedded as a sub-item of an array child', function () {
        assert.throws(() => {
            detect_malicious_keys({
                arr: [
                    {
                        sub: {
                            obj: {$set: 6}
                        }
                    }
                ]
                
            })
        })
    });

});