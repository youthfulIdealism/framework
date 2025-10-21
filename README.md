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

If you intend to use the `on_create`, `on_update`, or `on_delete` hooks, you will need to have a local replica set locally.

// TODO: add brief instructions for creating a local replica set when the mongoDB documentation comes back online.

## Basic Use

Make an express server, and connect to MongoDB:

```
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
```


```



## Development and Running Tests




