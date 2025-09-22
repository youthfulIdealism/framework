import * as z from "zod/v4";
import { isValidObjectId } from "mongoose";
import { F_Security_Model } from "./F_Security_Models/F_Security_Model.js";
import { query_object_to_mongodb_limits, query_object_to_mongodb_query } from "./utils/query_object_to_mongodb_query.js";
export function compile(app, collection, api_prefix) {
    for (let access_layers of collection.access_layers) {
        let base_layers_path_components = access_layers.layers.flatMap(ele => [ele, ':' + ele]);
        let get_one_path = [
            api_prefix,
            ...base_layers_path_components,
            `${collection.collection_id}/:document_id`
        ].join('/');
        app.get(get_one_path, async (req, res, next) => {
            console.log('CALLED');
            try {
                if (!isValidObjectId(req.params.document_id)) {
                    res.status(400);
                    res.json({ error: `${req.params.document_id} is not a valid document ID.` });
                    return;
                }
                let find = { '_id': req.params.document_id };
                for (let layer of access_layers.layers) {
                    find[`${layer}_id`] = req.params[layer];
                }
                let permissive_security_model = await F_Security_Model.model_with_permission(access_layers.security_models, req, res, find, 'get');
                if (!permissive_security_model) {
                    res.status(403);
                    res.json({ error: `You do not have permission to fetch documents from ${collection.collection_id}.` });
                    return;
                }
                let document;
                try {
                    document = await collection.mongoose_model.findOne(find, undefined, { 'lean': true });
                }
                catch (err) {
                    res.status(500);
                    res.json({ error: `there was a novel error` });
                    console.error(err);
                    return;
                }
                if (!document) {
                    let sendable = await permissive_security_model.handle_empty_query_results(req, res, 'get');
                    res.json(sendable);
                }
                else {
                    res.json({ data: document });
                }
            }
            catch (err) {
                console.error(err);
                return next(err);
            }
        });
        let get_multiple_path = [
            api_prefix,
            ...base_layers_path_components,
            collection.collection_id
        ].join('/');
        app.get(get_multiple_path, async (req, res) => {
            let validated_query_args;
            try {
                validated_query_args = collection.query_validator_server.parse(req.query);
            }
            catch (err) {
                if (err instanceof z.ZodError) {
                    res.status(400);
                    res.json({ error: err.issues });
                    return;
                }
                else {
                    console.error(err);
                    res.status(500);
                    res.json({ error: `there was a novel error` });
                    return;
                }
            }
            let find = query_object_to_mongodb_query(validated_query_args);
            for (let layer of access_layers.layers) {
                find[`${layer}_id`] = req.params[layer];
            }
            let permissive_security_model = await F_Security_Model.model_with_permission(access_layers.security_models, req, res, find, 'get');
            if (!permissive_security_model) {
                res.status(403);
                res.json({ error: `You do not have permission to fetch documents from ${collection.collection_id}.` });
                return;
            }
            let documents;
            try {
                let query = collection.mongoose_model.find(find, undefined, { 'lean': true });
                let fetch = query_object_to_mongodb_limits(query, collection.query_validator_server);
                documents = await fetch;
            }
            catch (err) {
                if (err.name == 'CastError') {
                    res.status(400);
                    res.json({ error: 'one of the IDs you passed to the query was not a valid MongoDB object ID.' });
                    return;
                }
                else {
                    res.status(500);
                    res.send({ error: 'there was a novel error' });
                    console.error(err);
                    return;
                }
            }
            if (!documents) {
                let sendable = await permissive_security_model.handle_empty_query_results(req, res, 'get');
                res.json(sendable);
            }
            else {
                res.json({ data: documents });
            }
        });
        let put_path = [
            api_prefix,
            ...base_layers_path_components,
            `${collection.collection_id}/:document_id`
        ].join('/');
        app.put(put_path, async (req, res) => {
            if (!isValidObjectId(req.params.document_id)) {
                res.status(400);
                res.json({ error: `${req.params.document_id} is not a valid document ID.` });
                return;
            }
            let find = { '_id': req.params.document_id };
            for (let layer of access_layers.layers) {
                find[`${layer}_id`] = req.params[layer];
            }
            let permissive_security_model = await F_Security_Model.model_with_permission(access_layers.security_models, req, res, find, 'update');
            if (!permissive_security_model) {
                res.status(403);
                res.json({ error: `You do not have permission to fetch documents from ${collection.collection_id}.` });
                return;
            }
            if (collection.mongoose_schema.updated_by?.type === String) {
                if (req.auth?.user_id) {
                    req.body.updated_by = req.auth?.user_id;
                }
                else {
                    req.body.updated_by = null;
                }
            }
            if (collection.mongoose_schema.updated_at?.type === Date) {
                req.body.updated_at = new Date();
            }
            let validated_request_body;
            try {
                validated_request_body = await collection.put_validator.parse(req.body);
            }
            catch (err) {
                if (err instanceof z.ZodError) {
                    res.status(400);
                    res.json({ error: err.issues });
                    return;
                }
                else {
                    console.error(err);
                    res.status(500);
                    res.json({ error: `there was a novel error` });
                    return;
                }
            }
            for (let layer of access_layers.layers) {
                if (validated_request_body[`${layer}_id`] && validated_request_body[`${layer}_id`] !== req.params[layer]) {
                    res.status(403);
                    res.json({ error: `The system does not support changing the ${layer}_id of the document with this endpoint.` });
                    return;
                }
            }
            let results;
            try {
                results = await collection.mongoose_update(find, validated_request_body);
            }
            catch (err) {
                res.status(500);
                res.json({ error: `there was a novel error` });
                console.error(err);
                return;
            }
            if (!results) {
                let sendable = await permissive_security_model.handle_empty_query_results(req, res, 'update');
                res.json(sendable);
            }
            else {
                res.json({ data: results });
            }
        });
        let post_path = [
            api_prefix,
            ...base_layers_path_components,
            `${collection.collection_id}`
        ].join('/');
        app.post(post_path, async (req, res) => {
            let permissive_security_model = await F_Security_Model.model_with_permission(access_layers.security_models, req, res, undefined, 'create');
            if (!permissive_security_model) {
                res.status(403);
                res.json({ error: `You do not have permission to fetch documents from ${collection.collection_id}.` });
                return;
            }
            if (collection.mongoose_schema.updated_by?.type === String) {
                if (req.auth?.user_id) {
                    req.body.updated_by = req.auth?.user_id;
                }
                else {
                    req.body.updated_by = null;
                }
            }
            if (collection.mongoose_schema.updated_at?.type === Date) {
                req.body.updated_at = new Date();
            }
            if (collection.mongoose_schema.created_by?.type === String) {
                if (req.auth?.user_id) {
                    req.body.created_by = req.auth?.user_id;
                }
                else {
                    req.body.created_by = null;
                }
            }
            if (collection.mongoose_schema.created_at?.type === Date) {
                req.body.created_at = new Date();
            }
            let validated_request_body;
            try {
                validated_request_body = await collection.post_validator.parse(req.body);
            }
            catch (err) {
                if (err instanceof z.ZodError) {
                    res.status(400);
                    res.json({ error: err.issues });
                    return;
                }
                else {
                    console.error(err);
                    res.status(500);
                    res.json({ error: `there was a novel error` });
                    return;
                }
            }
            for (let layer of access_layers.layers) {
                if (validated_request_body[`${layer}_id`] && validated_request_body[`${layer}_id`] !== req.params[layer]) {
                    res.status(403);
                    res.json({ error: `The system does not support changing the ${layer}_id of the document with this endpoint.` });
                    return;
                }
            }
            let results;
            try {
                results = await collection.mongoose_create(validated_request_body);
            }
            catch (err) {
                res.status(500);
                res.json({ error: `there was a novel error` });
                console.error(err);
                return;
            }
            if (!results) {
                let sendable = await permissive_security_model.handle_empty_query_results(req, res, 'create');
                res.json(sendable);
            }
            else {
                res.json({ data: results });
            }
        });
        let delete_path = [
            api_prefix,
            ...base_layers_path_components,
            `${collection.collection_id}/:document_id`
        ].join('/');
        app.delete(delete_path, async (req, res) => {
            if (!isValidObjectId(req.params.document_id)) {
                res.status(400);
                res.json({ error: `${req.params.document_id} is not a valid document ID.` });
                return;
            }
            let find = { '_id': req.params.document_id };
            for (let layer of access_layers.layers) {
                find[`${layer}_id`] = req.params[layer];
            }
            let permissive_security_model = await F_Security_Model.model_with_permission(access_layers.security_models, req, res, find, 'delete');
            if (!permissive_security_model) {
                res.status(403);
                res.json({ error: `You do not have permission to fetch documents from ${collection.collection_id}.` });
                return;
            }
            let results;
            try {
                results = await collection.mongoose_model.findOneAndDelete(find, { lean: true });
            }
            catch (err) {
                res.status(500);
                res.json({ error: `there was a novel error` });
                console.error(err);
                return;
            }
            if (!results) {
                let sendable = await permissive_security_model.handle_empty_query_results(req, res, 'delete');
                res.json(sendable);
            }
            else {
                res.json({ data: results });
            }
        });
    }
}
//# sourceMappingURL=F_Compile.js.map