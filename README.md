# Astir

Astir is a kids animation service controlled by parents.

The first version is focused on the backend logic:

1. A parent creates an account.
2. The parent adds a child profile.
3. A child phone, tablet, or TV opens the app in child mode.
4. The child device shows a pairing code.
5. The parent approves the pairing from the parent app.
6. The parent sets watch limits.
7. The child device can start and stop watch sessions inside those limits.

## Run The Server

1. Install dependencies if they are not installed yet.

```bash
npm install
```

2. Start the local server.

```bash
npm run .
```

3. Open the health check.

```text
http://127.0.0.1:3000/health
```

## Open Swagger

1. Start the server.

```bash
npm run .
```

2. Open Swagger in the browser.

```text
http://127.0.0.1:3000/api-docs
```

3. Use `POST /v1/auth/register` or `POST /v1/auth/login` first.
4. Copy the returned token.
5. Click `Authorize` in Swagger.
6. Paste the token for parent requests.
7. Use the pairing flow to get a device token.
8. Paste the device token for device requests.

## Run The Test Flow

1. Run the smoke test.

```bash
npm test
```

2. The test creates a parent.
3. The test verifies the parent PIN.
4. The test creates a child.
5. The test pairs a device.
6. The test starts and stops a watch session.

## Project Files

1. `run.js` starts the server.
2. `app/server.js` creates the Express app.
3. `app/routes/` contains the API routes.
4. `app/services/` contains the business logic.
5. `app/store/` contains the local JSON store.
6. `data/` is used for local JSON data.
7. `docs/` contains the project notes.
8. `scripts/` contains local scripts.

## Docs

1. Read `docs/main.txt` for the product idea.
2. Read `docs/data-model.md` for the backend objects.
3. Read `docs/api.md` for the API flow.
