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

`npm run .` uses `nodemon` for local development.
It watches app code and ignores local data files.

## Auth Switch

1. Open `.env`.
2. Keep auth enabled with this value.

```text
REQUIRE_AUTH=true
```

3. Disable auth locally with this value.

```text
REQUIRE_AUTH=false
```

4. Restart the server after changing `.env`.
5. When auth is disabled, protected routes use one local parent and one local device.
6. This switch is isolated in `app/middleware/auth.js`.

## Open Swagger

1. Start the server.

```bash
npm run .
```

2. Open Swagger in the browser.

```text
http://127.0.0.1:3000/index.html
```

The index page links to every Swagger page.

3. Open the full Swagger page if you need every endpoint.

```text
http://127.0.0.1:3000/api-docs
```

4. Open a smaller Swagger page if you only need one area.

```text
http://127.0.0.1:3000/parent-docs
http://127.0.0.1:3000/device-docs
http://127.0.0.1:3000/tariffs-docs
http://127.0.0.1:3000/content-docs
http://127.0.0.1:3000/pairing-docs
http://127.0.0.1:3000/watch-docs
```

5. Use `POST /v1/auth/register` or `POST /v1/auth/login` first.
6. Copy the returned token.
7. Click `Authorize` in Swagger.
8. Paste the token for parent requests.
9. Use the pairing flow to get a device token.
10. Paste the device token for device requests.

## Legacy Streaming API

The old Astir Streaming API is mounted separately from the local `/v1` API.

```text
http://127.0.0.1:3000/api/v1
http://127.0.0.1:3000/legacy-api-docs
http://127.0.0.1:3000/legacy-doc.json
```

The legacy runtime uses PostgreSQL. Configure `DATABASE_URL`, then run:

```bash
npm run db:migrate
npm run db:seed
```

`db:seed` creates the first `super_admin` from `SUPER_ADMIN_EMAIL`,
`SUPER_ADMIN_PASSWORD`, and `SUPER_ADMIN_NAME`.

## Run The Test Flow

1. Run the smoke test.

```bash
npm test
```

2. Run the auth-off test.

```bash
npm run test:auth-off
```

3. The smoke test creates a parent.
4. The smoke test verifies the parent PIN.
5. The smoke test creates a child.
6. The smoke test pairs a device.
7. The smoke test starts and stops a watch session.

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
4. Read `docs/architecture.md` for the code structure.
