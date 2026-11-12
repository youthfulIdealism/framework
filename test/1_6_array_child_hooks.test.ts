import assert from "assert";

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { F_Collection } from '../dist/F_Collection.js';
import { F_Collection_Registry } from '../dist/F_Collection_Registry.js'
import { F_SM_Open_Access } from '../dist/F_Security_Models/F_SM_Open_Access.js'
import { z } from 'zod'

import got from 'got'
import express, { Express } from 'express'
import mongoose, { Mongoose } from "mongoose";
import { Server } from "http";

/*
 * Exercises the array post hooks through the array child endpoints. The in-transaction hooks (array_on_create etc.)
 * need a replica set, which the local test database isn't, so these tests only register post hooks, which run
 * without a transaction.
 */
describe('Array child hooks', function () {
    const port = 4601;
    let express_app: Express;
    let server: Server;
    let db_connection: Mongoose;

    const validate_post = z.object({
        _id: z_mongodb_id,
        title: z.string(),
        notes: z.array(z.object({
            _id: z_mongodb_id.optional(),
            text: z.string(),
        })).optional(),
        meta: z.object({
            tags: z.array(z.object({
                _id: z_mongodb_id.optional(),
                label: z.string(),
            })).optional(),
        }).optional(),
    });

    let collection_post: F_Collection<'post', typeof validate_post>;
    let registry: F_Collection_Registry;

    // every hook call, recorded as [hook name, array item, parent document]
    let calls: [string, any, any][] = [];

    before(async function() {
        express_app = express();
        express_app.use(express.json());
        db_connection = await mongoose.connect('mongodb://127.0.0.1:27017/');

        collection_post = new F_Collection('post', 'posts', validate_post);
        collection_post.add_layers([], [new F_SM_Open_Access(collection_post)]);

        collection_post.after_update(async (parent) => { calls.push(['after_update', undefined, parent]); });
        collection_post.array_post_create('notes', async (note, parent) => { calls.push(['array_post_create notes', note, parent]); });
        collection_post.array_post_update('notes', async (note, parent) => { calls.push(['array_post_update notes', note, parent]); });
        collection_post.array_post_delete('notes', async (note_id, parent) => { calls.push(['array_post_delete notes', note_id, parent]); });
        collection_post.array_post_create('meta.tags', async (tag, parent) => { calls.push(['array_post_create meta.tags', tag, parent]); });

        let proto_registry = new F_Collection_Registry();
        registry = proto_registry.register(collection_post);
        registry.compile(express_app, '/api');

        server = express_app.listen(port);

        // wait for a moment because otherwise stuff breaks for no reason
        await new Promise(resolve => setTimeout(resolve, 200))
    })

    after(async function (){
        await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
        mongoose.connection.modelNames().forEach(ele => mongoose.connection.deleteModel(ele));
        db_connection.modelNames().forEach(ele => db_connection.deleteModel(ele));

        await new Promise(resolve => setTimeout(resolve, 500))

        await db_connection.disconnect()

        await new Promise(resolve => setTimeout(resolve, 500))
    });

    beforeEach(async function(){
        calls = [];
        for(let collection of Object.values(registry.collections)){
            //@ts-ignore
            await collection.mongoose_model.collection.drop();
        }
    })

    it(`should pass the created item and the parent to after_update and array_post_create`, async function () {
        let post = await collection_post.mongoose_model.create({ title: 'a', notes: [{ text: 'existing' }] });

        let results: any = await got.post(`http://localhost:${port}/api/post/${post._id}/notes`, {
            json: { text: 'new note' }
        }).json();

        assert.deepEqual(calls.map(call => call[0]), ['after_update', 'array_post_create notes']);
        let [, note, parent] = calls[1];
        assert.equal(note.text, 'new note');
        assert.ok(note._id, 'created item should have an _id');
        assert.equal(parent.notes.length, 2);
        assert.equal(String(parent.notes[1]._id), String(note._id));
        assert.equal(results.data.notes.length, 2);
    });

    it(`should pass the created item for an array nested inside an object`, async function () {
        let post = await collection_post.mongoose_model.create({ title: 'a', meta: { tags: [{ label: 'first' }] } });

        await got.post(`http://localhost:${port}/api/post/${post._id}/meta.tags`, {
            json: { label: 'second' }
        }).json();

        assert.deepEqual(calls.map(call => call[0]), ['after_update', 'array_post_create meta.tags']);
        assert.equal(calls[1][1].label, 'second');
        assert.equal(calls[1][2].meta.tags.length, 2);
    });

    it(`should pass the updated item and the parent to after_update and array_post_update, keeping the item's _id`, async function () {
        let post = await collection_post.mongoose_model.create({ title: 'a', notes: [{ text: 'one' }, { text: 'two' }] });
        let note_id = String((post as any).notes[1]._id);

        let results: any = await got.put(`http://localhost:${port}/api/post/${post._id}/notes/${note_id}`, {
            json: { _id: note_id, text: 'two, edited' }
        }).json();

        assert.deepEqual(calls.map(call => call[0]), ['after_update', 'array_post_update notes']);
        let [, note, parent] = calls[1];
        assert.equal(String(note._id), note_id);
        assert.equal(note.text, 'two, edited');
        assert.deepEqual(parent.notes.map((n: any) => n.text), ['one', 'two, edited']);
        assert.equal(String(results.data.notes[1]._id), note_id);
    });

    it(`should pass the deleted item's _id and the post-deletion parent to array_post_delete`, async function () {
        let post = await collection_post.mongoose_model.create({ title: 'a', notes: [{ text: 'one' }, { text: 'two' }] });
        let note_id = String((post as any).notes[0]._id);

        let results: any = await got.delete(`http://localhost:${port}/api/post/${post._id}/notes/${note_id}`).json();

        assert.deepEqual(calls.map(call => call[0]), ['after_update', 'array_post_delete notes']);
        let [, deleted_id, parent] = calls[1];
        assert.equal(deleted_id, note_id);
        assert.deepEqual(parent.notes.map((n: any) => n.text), ['two']);
        assert.deepEqual(results.data.notes.map((n: any) => n.text), ['two']);
    });

    it(`should not run any hooks or modify the document when updating or deleting an item that doesn't exist`, async function () {
        let post = await collection_post.mongoose_model.create({ title: 'a', notes: [{ text: 'one' }] });
        let missing_id = String(new mongoose.Types.ObjectId());

        let put_results: any = await got.put(`http://localhost:${port}/api/post/${post._id}/notes/${missing_id}`, {
            json: { _id: missing_id, text: 'nope' }
        }).json();
        let delete_results: any = await got.delete(`http://localhost:${port}/api/post/${post._id}/notes/${missing_id}`).json();

        assert.equal(put_results.data, null);
        assert.equal(delete_results.data, null);
        assert.deepEqual(calls, []);
        let unchanged: any = await collection_post.mongoose_model.findById(post._id).lean();
        assert.deepEqual(unchanged.notes.map((n: any) => n.text), ['one']);
    });
});
