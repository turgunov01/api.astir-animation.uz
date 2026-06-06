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

## 2. Request Registration OTP

Request:

```text
POST /v1/auth/otp/request
```

Body:

```json
{
  "email": "parent@example.com"
}
```

What happens:

1. The backend checks that no parent account already uses the email.
2. The backend sends a 6-digit OTP to that email.
3. In local development, set `OTP_DEFAULT_CODE` to skip email sending and return `debugCode`.

## 3. Verify Registration OTP

Request:

```text
POST /v1/auth/otp/verify
```

Body:

```json
{
  "email": "parent@example.com",
  "code": "123456"
}
```

What happens:

1. The backend verifies the OTP for that email.
2. The backend marks the email as verified for registration.
3. The app can now show the PIN setup step.

## 4. Register A Parent

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

1. The backend requires a recently verified registration OTP for the email.
2. The backend creates the parent account.
3. The password is stored as a hash.
4. The PIN is stored as a hash.
5. The backend returns a parent token.

## 5. Login As Parent

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

## 6. Verify Parent PIN

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

## 7. Create A Child

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

## 8. List Children

Request:

```text
GET /v1/children
```

This request needs a parent token.

Use this to show the children inside the parent app.

## 9. Create A Pairing Session

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

## 10. Approve Pairing

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

## 11. Poll Pairing Status

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

## 12. Get Device Config

Request:

```text
GET /v1/device/config
```

This request needs a device token.

What happens:

1. The backend checks the device token.
2. The backend returns the child profile.
3. The backend returns the current watch limits.

## 13. Update Watch Limits

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

## 14. List Content

Request:

```text
GET /v1/content
```

This request needs a parent token or a device token.

The first version returns fake content only.
Real content can be connected later.
Each content title includes `en`, `ru`, and `uz`.

## 15. List Tariffs

Request:

```text
GET /v1/tariffs
```

This request is public.

What happens:

1. The backend returns the available tariffs.
2. `free` is the default tariff.
3. `premium` can watch all free and premium content.

## 16. Get One Tariff

Request:

```text
GET /v1/tariffs/:tariff_id
```

This request is public.

What happens:

1. The backend finds the tariff by id.
2. The backend returns tariff details.

## 17. Create A Tariff

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

## 18. Update A Tariff

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

## 19. Delete A Tariff

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

## 20. Get Current Tariff

Request:

```text
GET /v1/tariffs/current
```

This request needs a parent token or a device token.

What happens:

1. The backend finds the parent account.
2. If no tariff is saved, the backend uses `free`.
3. The response shows whether premium content can be watched.

## 21. Change Current Tariff

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

## 22. Get Current Subscription

Request:

```text
GET /v1/billing/subscription/current
```

This request needs a parent token or a device token.

What happens:

1. The backend finds the parent account.
2. The backend returns the latest active subscription.
3. If there is no active subscription, `subscription` is `null`.

## 23. Verify Apple Purchase

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

The backend also accepts camelCase aliases: `tariffId`, `receiptData`, `providerSubscriptionId`,
`originalTransactionId`, `transactionId`, and `expiresAt`.

What happens:

1. The mobile app buys the tariff through Apple.
2. The mobile app sends the receipt to the backend.
3. The backend creates or updates the parent subscription.
4. The parent can watch premium content while the subscription is active.

## 24. Verify Google Play Purchase

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

The backend also accepts camelCase aliases: `tariffId`, `purchaseToken`, `productId`,
`providerSubscriptionId`, and `expiresAt`.

What happens:

1. The mobile app buys the tariff through Google Play.
2. The mobile app sends the purchase token to the backend.
3. The backend creates or updates the parent subscription.
4. The parent can watch premium content while the subscription is active.

## 25. Apple Subscription Webhook

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

## 26. Google Play Subscription Webhook

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

## 27. List Content Categories

Request:

```text
GET /v1/content/categories
```

This request needs a parent token or a device token.

What happens:

1. The backend checks the token.
2. The backend returns all content categories.

## 28. Get One Content Category

Request:

```text
GET /v1/content/categories/:category_id
```

This request needs a parent token or a device token.

What happens:

1. The backend checks the token.
2. The backend finds the category by id.
3. The backend returns the category.

## 29. Create A Content Category

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
  },
  "type": "cartoon",
  "slug": "cartoons",
  "active": true
}
```

For icon upload, send `multipart/form-data`:

1. `metadata` - JSON string with `title`, `description`, `type`, `slug`, and `active`.
2. `icon` - uploaded image file.

What happens:

1. The backend checks the parent token.
2. The backend checks that the category title is not already used.
3. The backend creates the category with `type`, `slug`, and `active` metadata.
4. If an icon file was sent, the backend stores it and returns `icon_url` plus `icon` metadata.

## 30. Update A Content Category

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
  },
  "type": "cartoon",
  "slug": "learning",
  "active": true
}
```

For icon upload or replacement, send `multipart/form-data`:

1. `metadata` - optional JSON string with `title`, `description`, `type`, `slug`, and/or `active`.
2. `icon` - uploaded image file.

What happens:

1. The backend checks the parent token.
2. The backend finds the category.
3. The backend updates the fields that were sent, including `type`, `slug`, and `active`.
4. If a new icon file was sent, the backend replaces the old icon file.

## 31. Delete A Content Category

Request:

```text
DELETE /v1/content/categories/:category_id
```

This request needs a parent token.

What happens:

1. The backend checks the parent token.
2. The backend finds the category.
3. The backend deletes the category.

## 32. List Content Tags

Request:

```text
GET /v1/content/tags
```

This request needs a parent token or a device token.

What happens:

1. The backend checks the token.
2. The backend returns all content tags.

## 33. Get One Content Tag

Request:

```text
GET /v1/content/tags/:tag_id
```

This request needs a parent token or a device token.

What happens:

1. The backend checks the token.
2. The backend finds the tag by id.
3. The backend returns the tag.

## 34. Create A Content Tag

Request:

```text
POST /v1/content/tags/create
```

This request needs a parent token.

Body:

```json
{
  "name": "Cartoons",
  "slug": "cartoons",
  "active": true
}
```

What happens:

1. The backend checks the parent token.
2. The backend checks that the tag name and slug are not already used.
3. The backend creates the tag.

## 35. Update A Content Tag

Request:

```text
PATCH /v1/content/tags/:tag_id
```

This request needs a parent token.

Body can include:

```json
{
  "name": "Learning",
  "slug": "learning",
  "active": true
}
```

What happens:

1. The backend checks the parent token.
2. The backend finds the tag.
3. The backend updates the fields that were sent.

## 36. Delete A Content Tag

Request:

```text
DELETE /v1/content/tags/:tag_id
```

This request needs a parent token.

What happens:

1. The backend checks the parent token.
2. The backend finds the tag.
3. The backend deletes the tag and removes it from linked movies.

## 37. List Movies

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

## 38. Get One Movie

Request:

```text
GET /v1/content/movies/:movie_id
```

This request needs a parent token or a device token.

What happens:

1. The backend finds the movie.
2. If the movie is premium, the backend checks the current tariff.
3. If the movie has an uploaded source file, the transcoder is checked.
4. If HLS is ready, the response includes `playback.hls_url` and `playback.auto_url`.
5. `playback.hls_url` points to the master playlist for automatic quality selection.
6. Manual quality options are listed in `playback.renditions` for `360`, `480`, `720`, and `1080`.
7. If HLS is not ready, the response includes the current playback status.

## 39. List Movie Series

Request:

```text
GET /v1/content/movies/:movie_id/series
```

This request needs a parent token or a device token.

What happens:

1. The backend finds the movie.
2. The backend reads the movie `series` array.
3. The backend returns the linked series movies.

## 40. Create Or Upload A Movie

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
  "category_id": "category-id",
  "series_id": "series-id",
  "year": 2026,
  "age_rating": 6,
  "duration_sec": 1234,
  "published": false,
  "tag_ids": ["tag-id"],
  "tags": ["New free-form tag"],
  "is_premium": false
}
```

For video upload, send `multipart/form-data`:

1. `metadata` - JSON string with the same fields, including optional `category_id`, `series_id`, `year`, `age_rating`, `duration_sec`, `published`, `tag_ids`, and `tags`.
2. `video` - uploaded video file.
3. `poster` - optional poster image.

Success response:

```json
{
  "data": {
    "id": "movie-id",
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
    "content_type": "movie",
    "category_id": "category-id",
    "series_id": "series-id",
    "series": [],
    "tag_ids": ["tag-id"],
    "tags": [
      {
        "id": "tag-id",
        "name": "Cartoons",
        "slug": "cartoons",
        "active": true
      }
    ],
    "is_premium": false,
    "age_rating": 6,
    "duration_sec": 1234,
    "duration": 1234,
    "year": 2026,
    "published": false,
    "published_at": null,
    "poster_url": "/media/uploads/poster.png",
    "poster": {
      "url": "/media/uploads/poster.png",
      "storage_path": "/absolute/storage/path/poster.png",
      "original_name": "poster.png",
      "mime_type": "image/png",
      "size": 250000
    },
    "source": "/media/uploads/movie.mp4",
    "video_url": "/media/uploads/movie.mp4",
    "storage_path": "/absolute/storage/path/movie.mp4",
    "transcode_status": "queued",
    "playback": {
      "type": "hls",
      "status": "queued",
      "hls_url": null,
      "auto_url": null,
      "qualities": [],
      "renditions": [],
      "error": null
    },
    "createdAt": "2026-06-01T00:00:00.000Z"
  }
}
```

When transcoding finishes, `playback.hls_url` is the `auto` HLS master playlist and `playback.renditions`
contains the generated manual playlists:

```json
{
  "playback": {
    "type": "hls",
    "status": "ready",
    "hls_url": "/media/hls/movie-id/master.m3u8",
    "auto_url": "/media/hls/movie-id/master.m3u8",
    "qualities": ["auto", "360", "480", "720", "1080"],
    "renditions": [
      { "quality": "360", "label": "360p", "playlist_url": "/media/hls/movie-id/360p/index.m3u8" },
      { "quality": "480", "label": "480p", "playlist_url": "/media/hls/movie-id/480p/index.m3u8" },
      { "quality": "720", "label": "720p", "playlist_url": "/media/hls/movie-id/720p/index.m3u8" },
      { "quality": "1080", "label": "1080p", "playlist_url": "/media/hls/movie-id/1080p/index.m3u8" }
    ],
    "error": null
  }
}
```

The response also includes `movie` with the same object for compatibility with older clients.

## 41. Update A Movie

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
  },
  "category_id": "category-id",
  "series_id": "series-id",
  "year": 2026,
  "age_rating": 6,
  "duration_sec": 1234,
  "published": true,
  "is_premium": false,
  "tag_ids": ["tag-id"],
  "tags": ["New free-form tag"]
}
```

For poster upload or combined metadata + poster update, send `multipart/form-data`:

1. `metadata` - optional JSON string with `title`, `description`, `category_id`, `series_id`, `year`, `age_rating`, `duration_sec`, `published`, `is_premium`, `tag_ids`, or `tags`.
2. `poster` - poster image. The `file` field is also accepted as an alias.

Direct poster upload:

```text
POST /v1/content/movies/:movie_id/poster
```

Multipart body:

1. `poster` - poster image, or `file` as a compatibility alias.

## 42. Replace Movie Tags

Request:

```text
PUT /v1/content/movies/:movie_id/tags
```

This request needs a parent token.

Body:

```json
{
  "tag_ids": ["tag-id"],
  "tags": ["New free-form tag"]
}
```

What happens:

1. The backend checks the parent token.
2. The backend finds the movie.
3. The backend replaces all movie tags with `tag_ids` plus tags resolved from `tags`.
4. Any free-form tag names in `tags` are created automatically if they do not exist.

## 43. Add Movie To Series

Request:

```text
POST /v1/content/movies/:movie_id/series
```

This request needs a parent token.

The body is the same as movie creation.
The backend creates a new movie and links it to the parent movie series.
The backend generates the new series movie `id` as a UUID.

## 44. Delete A Movie

Request:

```text
DELETE /v1/content/movies/:movie_id
```

This request needs a parent token.

What happens:

1. The backend deletes the movie record.
2. The backend removes uploaded source and HLS files for that movie.

## 45. Start A Watch Session

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

## 46. Stop A Watch Session

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
