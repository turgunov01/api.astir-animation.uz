# API Notes

Base path:

```text
/v1
```

All API responses are JSON.

Swagger index page is available here when the server is running:

```text
http://127.0.0.1:3000/index.html
```

Swagger is available here when the server is running:

```text
http://127.0.0.1:3000/api-docs
```

Smaller Swagger pages are available here:

```text
http://127.0.0.1:3000/parent-docs
http://127.0.0.1:3000/device-docs
http://127.0.0.1:3000/tariffs-docs
http://127.0.0.1:3000/content-docs
http://127.0.0.1:3000/pairing-docs
http://127.0.0.1:3000/watch-docs
```

The raw OpenAPI file is available here:

```text
http://127.0.0.1:3000/openapi.json
```

The duplicated legacy Astir Streaming API is available separately:

```text
http://127.0.0.1:3000/api/v1
http://127.0.0.1:3000/legacy-api-docs
http://127.0.0.1:3000/legacy-doc.json
```

The legacy API requires PostgreSQL for runtime requests. Run `npm run db:migrate`
and `npm run db:seed` after setting `DATABASE_URL` and the `SUPER_ADMIN_*`
environment variables.

Raw scoped OpenAPI files are available here:

```text
http://127.0.0.1:3000/parent-openapi.json
http://127.0.0.1:3000/device-openapi.json
http://127.0.0.1:3000/tariffs-openapi.json
http://127.0.0.1:3000/content-openapi.json
http://127.0.0.1:3000/pairing-openapi.json
http://127.0.0.1:3000/watch-openapi.json
```

Parent requests use this header:

```text
Authorization: Bearer <parentToken>
```

Child or TV device requests use this header:

```text
Authorization: Bearer <deviceToken>
```

## 1. Check If The Server Is Running

Request:

```text
GET /health
```

Use this before testing the rest of the API.

## 2. Register A Parent

Request:

```text
POST /v1/auth/register
```

Body:

```json
{
  "name": "Parent",
  "email": "parent@example.com",
  "password": "password123",
  "pin": "1234"
}
```

What happens:

1. The backend creates the parent account.
2. The password is stored as a hash.
3. The PIN is stored as a hash.
4. The backend returns a parent token.

## 3. Login As Parent

Request:

```text
POST /v1/auth/login
```

Body:

```json
{
  "email": "parent@example.com",
  "password": "password123"
}
```

What happens:

1. The backend checks the email and password.
2. The backend returns a parent token.

## 4. Verify Parent PIN

Request:

```text
POST /v1/auth/pin/verify
```

This request needs a parent token.

Body:

```json
{
  "pin": "1234"
}
```

Use this before actions that should be locked behind the parent PIN.

## 5. Create A Child

Request:

```text
POST /v1/children
```

This request needs a parent token.

Body:

```json
{
  "name": "Child",
  "birthYear": 2018
}
```

What happens:

1. The backend creates a child profile.
2. The child belongs to the current parent.
3. The backend creates default watch limits for the child.

## 6. List Children

Request:

```text
GET /v1/children
```

This request needs a parent token.

Use this to show the children inside the parent app.

## 7. Create A Pairing Session

Request:

```text
POST /v1/pairing/sessions
```

This request is called by the child phone, tablet, or TV before it is paired.

Body:

```json
{
  "deviceName": "Living Room TV",
  "platform": "tv"
}
```

What happens:

1. The backend creates a short pairing session.
2. The backend returns a code.
3. The backend returns a setup token.
4. The child app shows the code or QR payload on screen.

## 8. Approve Pairing

Request:

```text
POST /v1/pairing/sessions/:sessionId/approve
```

This request needs a parent token.

Body:

```json
{
  "childId": "child_id"
}
```

What happens:

1. The parent chooses the child profile.
2. The backend checks that the child belongs to the parent.
3. The backend creates a device record.
4. The backend creates a device token.
5. The pairing session becomes approved.

## 9. Poll Pairing Status

Request:

```text
GET /v1/pairing/sessions/:sessionId
```

This request is called by the child phone, tablet, or TV.

It needs this header:

```text
x-setup-token: <setupToken>
```

What happens:

1. The child device checks if the parent approved the pairing.
2. If approved, the backend returns the device token.
3. The child device saves the device token locally.

## 10. Get Device Config

Request:

```text
GET /v1/device/config
```

This request needs a device token.

What happens:

1. The backend checks the device token.
2. The backend returns the child profile.
3. The backend returns the current watch limits.

## 11. Update Watch Limits

Request:

```text
PUT /v1/children/:childId/limits
```

This request needs a parent token.

Body:

```json
{
  "dailyMinutes": 60,
  "allowedFrom": "08:00",
  "allowedTo": "20:00",
  "allowedDays": [1, 2, 3, 4, 5, 6, 7]
}
```

What happens:

1. The parent updates the child rules.
2. The child device receives the new rules the next time it loads config.

## 12. List Content

Request:

```text
GET /v1/content
```

This request needs a parent token or a device token.

The first version returns fake content only.
Real content can be connected later.
Each content title includes `en`, `ru`, and `uz`.

## 13. List Tariffs

Request:

```text
GET /v1/tariffs
```

This request is public.

What happens:

1. The backend returns the available tariffs.
2. `free` is the default tariff.
3. `premium` can watch all free and premium content.

## 14. Get One Tariff

Request:

```text
GET /v1/tariffs/:tariff_id
```

This request is public.

What happens:

1. The backend finds the tariff by id.
2. The backend returns tariff details.

## 15. Create A Tariff

Request:

```text
POST /v1/tariffs/create
```

This request needs a parent token.

Body:

```json
{
  "id": "family",
  "title": {
    "en": "Family",
    "ru": "Family",
    "uz": "Family"
  },
  "description": {
    "en": "Family access plan",
    "ru": "Family access plan",
    "uz": "Family access plan"
  },
  "is_default": false,
  "can_watch_premium": true
}
```

What happens:

1. The backend checks the parent token.
2. The backend creates the tariff.
3. If `id` is not sent, the backend generates one.

## 16. Update A Tariff

Request:

```text
PATCH /v1/tariffs/:tariff_id
```

This request needs a parent token.

Body can include:

```json
{
  "title": {
    "en": "Premium Plus",
    "ru": "Premium Plus",
    "uz": "Premium Plus"
  },
  "description": {
    "en": "Updated access plan",
    "ru": "Updated access plan",
    "uz": "Updated access plan"
  },
  "is_default": false,
  "can_watch_premium": true
}
```

## 17. Delete A Tariff

Request:

```text
DELETE /v1/tariffs/:tariff_id
```

This request needs a parent token.

What happens:

1. The backend checks the parent token.
2. The backend does not delete the default tariff.
3. The backend does not delete a tariff used by parent accounts.
4. The backend deletes the tariff if it is safe.

## 18. Get Current Tariff

Request:

```text
GET /v1/tariffs/current
```

This request needs a parent token or a device token.

What happens:

1. The backend finds the parent account.
2. If no tariff is saved, the backend uses `free`.
3. The response shows whether premium content can be watched.

## 19. Change Current Tariff

Request:

```text
PATCH /v1/tariffs/current
```

This request needs a parent token.

Body:

```json
{
  "tariff": "premium"
}
```

What happens:

1. The backend checks the parent token.
2. The backend checks that the tariff exists.
3. The backend saves the selected tariff on the parent account.

## 20. Get Current Subscription

Request:

```text
GET /v1/billing/subscription/current
```

This request needs a parent token or a device token.

What happens:

1. The backend finds the parent account.
2. The backend returns the latest active subscription.
3. If there is no active subscription, `subscription` is `null`.

## 21. Verify Apple Purchase

The local version validates the required fields and stores the subscription.
In production, this step should also call Apple before saving the subscription.

Request:

```text
POST /v1/billing/apple/verify
```

This request needs a parent token.

Body:

```json
{
  "tariff_id": "premium",
  "receipt": "apple-receipt-data",
  "provider_subscription_id": "1000001234567890",
  "expires_at": "2026-06-28T10:00:00.000Z"
}
```

What happens:

1. The mobile app buys the tariff through Apple.
2. The mobile app sends the receipt to the backend.
3. The backend creates or updates the parent subscription.
4. The parent can watch premium content while the subscription is active.

## 22. Verify Google Play Purchase

The local version validates the required fields and stores the subscription.
In production, this step should also call Google Play before saving the subscription.

Request:

```text
POST /v1/billing/google/verify
```

This request needs a parent token.

Body:

```json
{
  "tariff_id": "premium",
  "purchase_token": "google-purchase-token",
  "product_id": "astir_premium_monthly",
  "expires_at": "2026-06-28T10:00:00.000Z"
}
```

What happens:

1. The mobile app buys the tariff through Google Play.
2. The mobile app sends the purchase token to the backend.
3. The backend creates or updates the parent subscription.
4. The parent can watch premium content while the subscription is active.

## 23. Apple Subscription Webhook

Request:

```text
POST /v1/billing/webhook/apple
```

Body:

```json
{
  "provider_subscription_id": "1000001234567890",
  "status": "expired",
  "expires_at": "2026-06-28T10:00:00.000Z"
}
```

What happens:

1. Apple sends subscription status changes.
2. The backend updates the local subscription status.
3. Expired or cancelled subscriptions stop unlocking premium content.

## 24. Google Play Subscription Webhook

Request:

```text
POST /v1/billing/webhook/google
```

Body:

```json
{
  "purchase_token": "google-purchase-token",
  "status": "cancelled",
  "expires_at": "2026-06-28T10:00:00.000Z"
}
```

What happens:

1. Google Play sends subscription status changes.
2. The backend updates the local subscription status.
3. Expired or cancelled subscriptions stop unlocking premium content.

## 25. List Content Categories

Request:

```text
GET /v1/content/categories
```

This request needs a parent token or a device token.

What happens:

1. The backend checks the token.
2. The backend returns all content categories.

## 26. Get One Content Category

Request:

```text
GET /v1/content/categories/:category_id
```

This request needs a parent token or a device token.

What happens:

1. The backend checks the token.
2. The backend finds the category by id.
3. The backend returns the category.

## 27. Create A Content Category

Request:

```text
POST /v1/content/categories/create
```

This request needs a parent token.

Body:

```json
{
  "title": {
    "en": "Cartoons",
    "ru": "Мультфильмы",
    "uz": "Multfilmlar"
  },
  "description": {
    "en": "Short animated shows for kids",
    "ru": "Короткие мультфильмы для детей",
    "uz": "Bolalar uchun qisqa multfilmlar"
  }
}
```

What happens:

1. The backend checks the parent token.
2. The backend checks that the category title is not already used.
3. The backend creates the category.

## 28. Update A Content Category

Request:

```text
PATCH /v1/content/categories/:category_id
```

This request needs a parent token.

Body:

```json
{
  "title": {
    "en": "Learning",
    "ru": "Обучение",
    "uz": "O'rganish"
  },
  "description": {
    "en": "Educational videos for kids",
    "ru": "Обучающие видео для детей",
    "uz": "Bolalar uchun o'quv videolar"
  }
}
```

What happens:

1. The backend checks the parent token.
2. The backend finds the category.
3. The backend updates the fields that were sent.

## 29. Delete A Content Category

Request:

```text
DELETE /v1/content/categories/:category_id
```

This request needs a parent token.

What happens:

1. The backend checks the parent token.
2. The backend finds the category.
3. The backend deletes the category.

## 30. List Movies

Request:

```text
GET /v1/content/movies
```

This request needs a parent token or a device token.

What happens:

1. The backend checks the token.
2. The backend returns movie records.
3. The `free` tariff returns only non-premium movies.
4. The `premium` tariff returns all movies.
5. Each movie includes playback status.

## 31. Get One Movie

Request:

```text
GET /v1/content/movies/:movie_id
```

This request needs a parent token or a device token.

What happens:

1. The backend finds the movie.
2. If the movie is premium, the backend checks the current tariff.
3. If the movie has an uploaded source file, the transcoder is checked.
4. If HLS is ready, the response includes `playback.hls_url`.
5. If HLS is not ready, the response includes the current playback status.

## 32. List Movie Series

Request:

```text
GET /v1/content/movies/:movie_id/series
```

This request needs a parent token or a device token.

What happens:

1. The backend finds the movie.
2. The backend reads the movie `series` array.
3. The backend returns the linked series movies.

## 33. Create Or Upload A Movie

Request:

```text
POST /v1/content/movies/create
```

This request needs a parent token.
The backend generates the movie `id` as a UUID.

JSON body:

```json
{
  "title": {
    "en": "Movie title",
    "ru": "Movie title RU",
    "uz": "Movie title UZ"
  },
  "description": {
    "en": "Movie description",
    "ru": "Movie description RU",
    "uz": "Movie description UZ"
  },
  "series": [],
  "is_premium": false
}
```

For video upload, send `multipart/form-data`:

1. `metadata` - JSON string with the same fields.
2. `video` - uploaded video file.

## 34. Update A Movie

Request:

```text
PATCH /v1/content/movies/:movie_id
```

This request needs a parent token.

Body can include:

```json
{
  "title": {
    "en": "New title",
    "ru": "New title RU",
    "uz": "New title UZ"
  },
  "description": {
    "en": "New description",
    "ru": "New description RU",
    "uz": "New description UZ"
  }
}
```

## 35. Add Movie To Series

Request:

```text
POST /v1/content/movies/:movie_id/series
```

This request needs a parent token.

The body is the same as movie creation.
The backend creates a new movie and links it to the parent movie series.
The backend generates the new series movie `id` as a UUID.

## 36. Delete A Movie

Request:

```text
DELETE /v1/content/movies/:movie_id
```

This request needs a parent token.

What happens:

1. The backend deletes the movie record.
2. The backend removes uploaded source and HLS files for that movie.

## 37. Start A Watch Session

Request:

```text
POST /v1/watch-sessions/start
```

This request needs a device token.

Body:

```json
{
  "contentId": "bluey-001"
}
```

What happens:

1. The backend checks the device token.
2. The backend checks the child limits.
3. The backend checks if today is allowed.
4. The backend checks if the current time is allowed.
5. The backend checks if the daily limit is already used.
6. If all checks pass, the watch session starts.

## 38. Stop A Watch Session

Request:

```text
PATCH /v1/watch-sessions/:watchSessionId/stop
```

This request needs a device token.

What happens:

1. The backend finds the active watch session.
2. The backend checks that it belongs to the same device.
3. The backend stores the end time.
4. The backend stores the watched duration.

## Error Response

Example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "requestId": "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8"
  }
}
```
