# Architecture Notes

The backend is split into small layers.

The goal is simple:

1. Routes know about URLs.
2. Controllers know about HTTP requests and responses.
3. Services know about business rules.
4. Repositories know about data access.
5. Storage can change later without rewriting the API.

## 1. Server

Files:

1. `run.js`
2. `app/server.js`

What they do:

1. `run.js` starts the HTTP server.
2. `app/server.js` creates the Express app.
3. The server adds common middleware.
4. The server mounts Swagger.
5. The server mounts `/v1` API routes.
6. The server adds 404 and error handlers at the end.

## 2. Container

File:

1. `app/bootstrap/createContainer.js`

What it does:

1. Creates repositories.
2. Creates services.
3. Creates middleware.
4. Creates controllers.
5. Returns everything to the server.

This keeps dependency setup in one place.

## 3. Routes

Folder:

1. `app/routes/`

What they do:

1. Define endpoint paths.
2. Attach auth middleware.
3. Call the correct controller method.

Routes should stay small.

## 4. Controllers

Folder:

1. `app/controllers/`

What they do:

1. Read request params.
2. Read request body.
3. Validate input.
4. Call services.
5. Send JSON responses.

Controllers should not know how data is stored.

## 5. Services

Folder:

1. `app/services/`

What they do:

1. Handle parent auth rules.
2. Handle child profile rules.
3. Handle pairing rules.
4. Handle watch limit rules.
5. Handle watch session rules.

Services should not import the JSON store directly.
They receive repositories from the container.

## 6. Repositories

Folder:

1. `app/repositories/`

What they do:

1. Read data from the current store.
2. Write data to the current store.
3. Hide storage details from services.

Today the storage is JSON.
Later it can become PostgreSQL.

## 7. Middleware

Folder:

1. `app/middleware/`

What it does:

1. Reads parent tokens.
2. Reads device tokens.
3. Adds request ids.
4. Handles errors in one format.

Every error response includes `requestId`.

## 8. Current Storage

Folder:

1. `app/store/`

What it does:

1. Stores local data in `data/store.json`.
2. Creates records with ids.
3. Updates records.
4. Keeps the first version easy to run locally.

This is good for the MVP.
The next real production step is PostgreSQL.
