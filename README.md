# Overview

Framework is a tool meant to speed up mongodb + express backend and frontend development by reducing the number of places schemas need to be defined. Without Framework, for each collection, it is necessary to:
- define a mongoose schema for the database
- define a validation schema for ingesting the data
- define various query validators for querying the data
- build a client library that's compliant with all of the other schemas

Framework solves this by centralizing schema definition at the validator, and then generating the rest of the schemas procedurally. It ingests a zod validator, and then dynamically produces the mongoose schema, express endpoints, query validators, and client library.

Updating a schema in one place but not all of the others can be a pernicious source of bugs. Framework also mitigates this: since all of the schemas are generated using a zod validator, there's only one source of truth. Updating the zod validator updates the mongoose schema, endpoints, and client library. The only thing left to update is the UI.

Framework is opinionated.

## Setup

To install Framework in a project, run `npm install @liminalfunctions/framework`. Framework lists ky, express, mongoose, and zod as peer dependencies. You will also need to run `npm install ky express mongoose zod; npm install --save-dev @types/express`.

If you intend to use the `on_create`, `on_update`, or `on_delete` hooks, you will need to have a local replica set locally. This is because mongoDB transactions require a replica set.

[Here are detailed instructions for setting up a local replica set](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set/). Abbreviated instructions for setting up a replica set on Windows are below:

### Setting up a replica set

- Create a root database folder somewhere convenient to store your database and config files
- In that root database folder, create three subfolders, named `database_0`, `database_1`, and `database_2`, respectively
- In that folder, create the following three config files, named `config_server_0.csg`, `config_server_1.csg`, and `config_server_2.csg`, respectively

```yaml
# mongod.conf

# for documentation of all options, see:
#   http://docs.mongodb.org/manual/reference/configuration-options/

# Where and how to store data.
storage:
  dbPath: <PATH TO database_0>

# where to write logging data.
systemLog:
  destination: file
  logAppend: true
  path: <PATH TO database_0>\log\mongod.log

# network interfaces
net:
  port: 27018
  bindIp: 127.0.0.1
#processManagement:

#security:

#operationProfiling:

#replication:
replication:
  replSetName: "local_replica_set"

#sharding:

## Enterprise-Only Options:

#auditLog:
```

```yaml
# mongod.conf

# for documentation of all options, see:
#   http://docs.mongodb.org/manual/reference/configuration-options/

# Where and how to store data.
storage:
  dbPath: <PATH TO database_1>

# where to write logging data.
systemLog:
  destination: file
  logAppend: true
  path: <PATH TO database_1>\log\mongod.log

# network interfaces
net:
  port: 27019
  bindIp: 127.0.0.1
#processManagement:

#security:

#operationProfiling:

#replication:
replication:
  replSetName: "local_replica_set"

#sharding:

## Enterprise-Only Options:

#auditLog:

```

```yaml
# mongod.conf

# for documentation of all options, see:
#   http://docs.mongodb.org/manual/reference/configuration-options/

# Where and how to store data.
storage:
  dbPath: <PATH TO database_2>

# where to write logging data.
systemLog:
  destination: file
  logAppend: true
  path: <PATH TO database_2>\log\mongod.log

# network interfaces
net:
  port: 27020
  bindIp: 127.0.0.1
#processManagement:

#security:

#operationProfiling:

#replication:
replication:
  replSetName: "local_replica_set"

#sharding:

## Enterprise-Only Options:

#auditLog:

```
- create three powershell files in the root database folder, named `start_server_0.ps1`, `start_server_1.ps1`, `start_server_2.ps1` respectively:

```powershell
mongod --config "<PATH TO ROOT DATABASE FOLDER>\config_server_0.cfg"
```

```powershell
mongod --config "<PATH TO ROOT DATABASE FOLDER>\config_server_1.cfg"
```

```powershell
mongod --config "<PATH TO ROOT DATABASE FOLDER>\config_server_2.cfg"
```

- create a powershell file in the root database folder, named `start.ps1`:
```powershell
$j0 = Start-Job -FilePath "./start_server_0.ps1"
$j1 = Start-Job -FilePath "./start_server_1.ps1"
$j2 = Start-Job -FilePath "./start_server_2.ps1"

Wait-Job -Job $j0
Wait-Job -Job $j1
Wait-Job -Job $j2
```
- in a console, run `./start.ps1`
- in another console, within mongosh, initiate the replica set:
```
rs.initiate( {
   _id : "local_replica_set",
   members: [
      { _id: 0, host: "mongodb0.example.net:27018" },
      { _id: 1, host: "mongodb1.example.net:27019" },
      { _id: 2, host: "mongodb2.example.net:27020" }
   ]
})
```

When you want to connect to the replica set in `mongoose.connect(...)`, you have to connect to all three members, like so:
```javascript
let db_connection = await mongoose.connect('mongodb://127.0.0.1:27018,127.0.0.1:27019,127.0.0.1:27020/DATABASE_NAME?replicaSet=local_replica_set');
```

## Basic Use

Make an express server, and connect to MongoDB:

```typescript
import express, { Express } from 'express'
import mongoose, { Mongoose } from "mongoose";
import { Server } from "http";

const port = 4601;
// set up express
let express_app = express();
express_app.use(express.json());

// set up the mongodb connection
let db_connection = await mongoose.connect('mongodb://127.0.0.1:27017/');



// start the express server
let server = express_app.listen(port);

```

Create your schemas:
[For more on creating schemas, see src/0_basic/ in the example repository](https://github.com/youthfulIdealism/framework-examples)
```typescript
import { F_Collection } from '@liminalfunctions/framework/F_Collection.js';
import { F_SM_Open_Access } from '@liminalfunctions/framework/F_SM_Open_Access.js';
import { z_mongodb_id, z_mongodb_id_nullable, z_mongodb_id_optional } from '@liminalfunctions/framework/index.js';
import z from 'zod/v4';

// define a collection for the user.
let collection_user = new F_Collection(
    'user',// the name of the collection
    'users',// the plural name of the collection
    z.object({// the valdiator
        // mongodb IDs need to use the  special validator `z_mongodb_id`. If you modify the validator (for example, by using z_mongodb_id.optional() or z_mongodb_id.nullable()),
        // it will stop working properly. Instead, use the validators z_mongodb_id_nullable or z_mongodb_id_optional.
        _id: z_mongodb_id,
        name: z.string(),
        auth_system_id: z.string(),
    })
)
```

Set up the API path and security to your schema:
[For more on creating schemas, see src/0_basic/ in the example repository](https://github.com/youthfulIdealism/framework-examples)
```typescript
// set up the access to the user collection. This is done via "layers". A "layer" is the heirachy of ways documents in a collection can be accessed.
// In this case, the user isn't "owned" by anything, so we set it up to be accessible at the base /api/ endpoint. The add_layers method also sets up
// the security for the collection at that particular endpoint.
collection_user.add_layers(
    [],// no layers between the base /api/ endpoint and the user
    [new F_SM_Open_Access(collection_user)] // the array of security models. In this case, we're allowing anyone access to the users collection,
                                            // so anyone can read/write/update/delete users. This is not secure, but this is example code, so it's fine.
);
```


Set up the Express endpoints:
[For more on using the collection registry to set up endpoints, see src/0_basic/ in the example repository](https://github.com/youthfulIdealism/framework-examples)
```typescript
// the collection re
let collection_registry = (new F_Collection_Registry())
    .register(collection_user)
```

Set up authentication:
```typescript
// set up the code that generates the auth information across all endpoints. It is incumbent on this piece of code to return the user's current ID
// and the user's permissions within each layer. The security models take that information and make a decision about whether to allow a given operation.
// This is where you would integrate a seperate auth system--for example, Firebase auth or Supabase auth. For more details, see the security model example.
F_Security_Model.set_auth_fetcher(async (req: Request) => {
    // if there's no authorization header, return undefined because there's no user
    if(!req.headers.authorization){ return undefined; }

    // if there's an authorization header, find the user associated with that information
    let user_record = await collection_user.mongoose_model.findOne({auth_system_id: req.headers.authorization})

    // if no user was found, return undefined.
    if(!user_record){ return undefined; }

    // if a user was found, return an authorization object.
    return { user_id: user_record._id + '', layers: [] };
})
```

Start the express server:
```typescript
// start the express server
let server = express_app.listen(port);
```

### Security

Implement a security model:
[For more on implementing your own securiyt models, see /src/2_security_models in the example repository](https://github.com/youthfulIdealism/framework-examples)
```typescript
import * as z from "zod/v4";
import { Request, Response } from "express";
import { Empty_Query_Possibilities, F_Security_Model, Operation } from "@liminalfunctions/framework/F_Security_Model.js";
import { F_Collection } from "@liminalfunctions/framework/F_Collection.js";

export class Security_Model_Allow<Collection_ID extends string, ZodSchema extends z.ZodObject> extends F_Security_Model<Collection_ID, ZodSchema> {

    constructor(collection: F_Collection<Collection_ID, ZodSchema>){
        super(collection);
    }

    /**
     * returns true if the security model allows the create/read/update/delete operation
     */
    async has_permission(req: Request, res: Response, find: {[key: string]: any}, operation: Operation): Promise<boolean> {
        console.log(`trying to access collection ${this.collection.collection_id} through Security_Model_Allow. Granting access!`)
        return true;
    }

    /**
     * In the event that the query results are empty, this method allows the security model to decide whether to
     * throw an access error or just return no data. 99% of the time, you'll just want to return no data and can
     * reproduce this method exactly as shown. For an example of when this is not true, see security_model_low_value_assets.
     */
    async handle_empty_query_results(req: Request, res: Response, operation: Operation): Promise<Empty_Query_Possibilities> {
        return { data: null }
    }
}
```

Use the security model on a collection:
[For more on implementing your own security models, see /src/2_security_models in the example repository](https://github.com/youthfulIdealism/framework-examples)
[For more using the built-in security models, see /src/3_built_in_security_models in the example repository](https://github.com/youthfulIdealism/framework-examples)
```typescript
collection_user.add_layers(
    [],
    [new Security_Model_Allow(collection_user)]
);
```

### Business Logic
Business logic is handled via on_create, after_create, on_update, after_update, on_delete, and after_delete hooks.
[For more on using hooks, see /src/4_hooks in the example repository](https://github.com/youthfulIdealism/framework-examples)

Specify a new `user_profile` collection and a hook that creates a user_profile whenever a new user is created:
```typescript
let collection_user_profile = new F_Collection('user_profile', 'user_profiles',z.object({// the valdiator
        _id: z_mongodb_id,
        user_id: z_mongodb_id,
        profile_picture_url: z.string(),
    })
)

// whenever a project is created, auto-generate the steps.
collection_user_profile.on_create(async (session, created_document) => {
    await collection_step.mongoose_model.create([{
        user_id: created_document._id_,
        profile_picture_url: "http://localhost:8123/images/some_url.png",
    }], { session: session })
})
```

### Auto-Generated Client Libraries

Given a complete collection registry, auto-generate a client library. The client library will still need its dependencies installed via `npm install`, and it will need to be built using `npm run-script build`.
[For more on generating and using client libraries, see /src/5_client_libraries in the example repository](https://github.com/youthfulIdealism/framework-examples)
```typescript
import { generate_client_library } from '@liminalfunctions/framework/generate_client_library.js';

await generate_client_library('./out/client_library', collection_registry);
```

## Development and Running Tests

To develop this tool, download it. The tool can be built using `npm run-script build`. The tool can be tested using `npm run-script test`.

The test files are in the `/test/` folder. I use mocha for testing.

The tests have a minor glitch: if you run the `1_2_role_membership.test.ts` along with any other test, there's a race condition in the setup/teardown of the database and server. To run `1_2_role_membership.test.ts`, you need to replace the line

```typescript
describe.skip('Security Model Role Membership', function () {
```

with

```typescript
describe.only('Security Model Role Membership', function () {
```

I would welcome any pull requests that fix this.