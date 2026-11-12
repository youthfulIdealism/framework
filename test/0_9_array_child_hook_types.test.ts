import assert from "assert";

import { z_mongodb_id } from '../dist/utils/mongoose_from_zod.js';
import { F_Collection, Array_Child_Paths, Array_Child_At } from '../dist/F_Collection.js';
import { z } from 'zod'

/*
 * Most of what this file checks is at the type level: the @ts-expect-error lines and Assert_Equal checks are
 * verified by `tsc --noEmit -p test`, not by mocha (mocha runs through tsx, which does not type-check).
 * If the array hook typing regresses, `tsc -p test` reports an error in this file.
 */

type Assert_Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function assert_type<T extends true>() {}

const validate_post = z.object({
    _id: z_mongodb_id,
    title: z.string(),
    created_at: z.date(),
    notes: z.array(z.object({
        _id: z_mongodb_id,
        text: z.string(),
    })),
    meta: z.object({
        tags: z.array(z.object({
            _id: z_mongodb_id,
            label: z.string(),
        })).optional(),
    }),
    // array_children_from_zod only requires that an _id field exists, so an optional _id still counts
    comments: z.array(z.object({
        _id: z_mongodb_id.optional(),
        body: z.string(),
    })).optional(),
    plain_list: z.array(z.string()),
    no_id_list: z.array(z.object({ x: z.number() })),
});
type Post = z.output<typeof validate_post>;

// recursive schema, to make sure the depth limit keeps the compiler from recursing forever
type Tree_Node = { _id: string, label: string, children: Tree_Node[] };
const validate_tree_node: z.ZodType<Tree_Node> = z.object({
    _id: z_mongodb_id,
    label: z.string(),
    get children() { return z.array(validate_tree_node); },
});
const validate_tree = z.object({
    _id: z_mongodb_id,
    root: z.object({ nodes: z.array(validate_tree_node) }),
});

describe('Array child hook types', function () {
    it('should derive exactly the array child paths that array_children_from_zod finds at runtime', function () {
        assert_type<Assert_Equal<Array_Child_Paths<Post>, 'notes' | 'meta.tags' | 'comments'>>();

        let collection = new F_Collection('array_hook_type_post', 'array_hook_type_posts', validate_post);
        assert.deepEqual(Array.from(collection.array_children_map.keys()).sort(), ['comments', 'meta.tags', 'notes']);
    });

    it('should resolve the element type at a path', function () {
        assert_type<Assert_Equal<Array_Child_At<Post, 'notes'>, { _id: string, text: string }>>();
        assert_type<Assert_Equal<Array_Child_At<Post, 'meta.tags'>, { _id: string, label: string }>>();
        assert_type<Assert_Equal<Array_Child_At<Post, 'comments'>, { _id?: string, body: string }>>();
    });

    it('should type array_item in the array hooks and reject unknown keys', function () {
        let collection = new F_Collection('array_hook_type_post_2', 'array_hook_type_post_2s', validate_post);

        collection.array_on_create('notes', async (session, note, parent) => {
            assert_type<Assert_Equal<typeof note, { _id: string, text: string }>>();
            assert_type<Assert_Equal<typeof parent, Post>>();
        });
        collection.array_post_create('meta.tags', async (tag, parent) => {
            assert_type<Assert_Equal<typeof tag, { _id: string, label: string }>>();
        });
        collection.array_on_update('notes', async (session, note) => {
            // @ts-expect-error notes items have no label field
            note.label;
        });
        collection.array_on_delete('notes', async (session, deleted_id, parent) => {
            assert_type<Assert_Equal<typeof deleted_id, string>>();
            assert_type<Assert_Equal<typeof parent, Post>>();
        });
        collection.array_post_delete('meta.tags', async (deleted_id) => {
            assert_type<Assert_Equal<typeof deleted_id, string>>();
        });

        // @ts-expect-error misspelled key
        collection.array_on_create('ntoes', async () => {});
        // @ts-expect-error arrays of primitives are not array children
        collection.array_on_delete('plain_list', async () => {});
        // @ts-expect-error arrays of objects without an _id are not array children
        collection.array_post_delete('no_id_list', async () => {});
        // @ts-expect-error date fields are not traversed
        collection.array_post_update('created_at', async () => {});

        assert.equal(collection.array_item_create_hooks.get('notes')?.length, 1);
        assert.equal(collection.array_item_post_create_hooks.get('meta.tags')?.length, 1);
        assert.equal(collection.array_item_update_hooks.get('notes')?.length, 1);
    });

    it('should handle recursive schemas without exceeding the type instantiation depth', function () {
        type Tree = z.output<typeof validate_tree>;
        assert_type<Assert_Equal<Array_Child_Paths<Tree>, 'root.nodes'>>();

        let collection = new F_Collection('array_hook_type_tree', 'array_hook_type_trees', validate_tree);
        collection.array_on_create('root.nodes', async (session, node) => {
            assert_type<Assert_Equal<typeof node, Tree_Node>>();
        });
    });
});
