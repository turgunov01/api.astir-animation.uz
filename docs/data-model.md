# Data Model Notes

This file explains the first backend objects in plain steps.

The first version stores data in a local JSON file.
Later this can move to PostgreSQL without changing the main API flow.

## 1. Parent

A parent is the main account owner.

The parent can:

1. Login.
2. Set a 4 digit PIN.
3. Add children.
4. Approve child devices.
5. Set watch limits.
6. Keep the current tariff.

Stored fields:

1. `id`
2. `name`
3. `email`
4. `passwordHash`
5. `pinHash`
6. `tariff`
7. `createdAt`
8. `updatedAt`

Rules:

1. New parents start with the `free` tariff.
2. Old parent records without a tariff are treated as `free`.

## 2. Tariff

A tariff controls which content can be watched.

Seeded tariffs:

1. `free`
2. `premium`

Stored fields:

1. `id`
2. `title`
3. `description`
4. `is_default`
5. `can_watch_premium`
6. `price`
7. `price_cents`
8. `currency`
9. `createdAt`
10. `updatedAt`

Rules:

1. `free` is the default tariff.
2. `free` can watch only non-premium content.
3. `premium` can watch all content.
4. A parent can create, update, and delete custom tariffs.
5. The default tariff cannot be deleted.
6. A tariff used by parent accounts cannot be deleted.
7. The selected tariff id is stored on the parent account.
8. A paired device uses the tariff of its parent account.
9. Payment checkout uses the tariff price stored on the backend, not a client-provided amount.

## 3. Subscription

A subscription connects a parent account to a paid tariff.

Stored fields:

1. `id`
2. `parentId`
3. `tariffId`
4. `provider`
5. `providerSubscriptionId`
6. `status`
7. `startedAt`
8. `expiresAt`
9. `createdAt`
10. `updatedAt`

Rules:

1. `provider` can be `apple` or `google`.
2. `status` can be `active`, `grace_period`, `expired`, or `cancelled`.
3. `active` and `grace_period` can unlock paid content until `expiresAt`.
4. Expired and cancelled subscriptions do not unlock paid content.
5. The current tariff uses the latest active subscription first.
6. If there is no active subscription, the backend uses the parent saved tariff or the default tariff.

## 4. Child

A child profile belongs to one parent.

The child profile is used for rules and watching history.

Stored fields:

1. `id`
2. `parentId`
3. `name`
4. `birthYear`
5. `createdAt`
6. `updatedAt`

Rules:

1. One parent can have many children.
2. One child can have many paired devices.
3. One child has one current watch limit.
4. One child can have many watch sessions.

## 5. Device

A device is a child phone, tablet, or TV app.

The device does not register with email and password.
It gets paired by the parent.

Stored fields:

1. `id`
2. `parentId`
3. `childId`
4. `name`
5. `platform`
6. `tokenHash`
7. `pairedAt`
8. `createdAt`
9. `updatedAt`

Rules:

1. A device belongs to one child.
2. A device belongs to one parent through that child.
3. A device uses a device token after pairing.

## 6. Pairing Session

A pairing session is created before the device belongs to anyone.

The child app or TV app creates it.
The parent approves it.

Stored fields:

1. `id`
2. `code`
3. `setupTokenHash`
4. `deviceName`
5. `platform`
6. `status`
7. `parentId`
8. `childId`
9. `deviceId`
10. `expiresAt`
11. `createdAt`
12. `updatedAt`

Statuses:

1. `pending`
2. `approved`
3. `expired`

Rules:

1. A pending session waits for parent approval.
2. An approved session creates one device.
3. An expired session cannot be approved.

## 7. Watch Limit

A watch limit is the rule set for one child.

Stored fields:

1. `id`
2. `parentId`
3. `childId`
4. `dailyMinutes`
5. `allowedFrom`
6. `allowedTo`
7. `allowedDays`
8. `createdAt`
9. `updatedAt`

Rules:

1. `dailyMinutes` controls how much the child can watch per day.
2. `allowedFrom` is the start time.
3. `allowedTo` is the end time.
4. `allowedDays` controls which days are allowed.

## 8. Watch Session

A watch session is created when the child starts watching something.

Stored fields:

1. `id`
2. `parentId`
3. `childId`
4. `deviceId`
5. `contentId`
6. `startedAt`
7. `endedAt`
8. `durationSeconds`
9. `createdAt`
10. `updatedAt`

Rules:

1. A device can start a session only inside the child limits.
2. A session starts with `startedAt`.
3. A session stops with `endedAt`.
4. The backend stores the watched duration in seconds.

## 9. Content Item

The first version uses fake content.

Stored fields:

1. `id`
2. `title`
3. `type`
4. `ageRating`
5. `durationMinutes`

Rules:

1. Fake content is enough for testing watch sessions.
2. Real cartoon or TV content can be connected later.
3. `title` must include `en`, `ru`, and `uz`.

## 10. Content Category

A content category is used to group content.

Stored fields:

1. `id`
2. `title`
3. `description`
4. `type`
5. `slug`
6. `active`
7. `icon`
8. `icon_url`
9. `createdAt`
10. `updatedAt`

Rules:

1. Category names should be unique.
2. A parent can create categories.
3. A parent can update categories.
4. A parent can delete categories.
5. Parent and paired device clients can read categories.
6. `title` must include `en`, `ru`, and `uz`.
7. `description` must include `en`, `ru`, and `uz`.
8. `type` defaults to `other`.
9. `slug` defaults to a generated slug from the category title.
10. `active` defaults to `true`.
11. `icon` is optional and stores uploaded image metadata.

Example:

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

## 11. Content Tag

A content tag is used to label movies, cartoons, and episodes.

Stored fields:

1. `id`
2. `name`
3. `slug`
4. `active`
5. `createdAt`
6. `updatedAt`

Rules:

1. Tag names should be unique.
2. Tag slugs should be unique.
3. A parent can create, update, and delete tags.
4. Parent and paired device clients can read tags.
5. `active` defaults to `true`.

Example:

```json
{
  "name": "Cartoons",
  "slug": "cartoons",
  "active": true
}
```

## 12. Content Movie

A content movie is a movie, cartoon, or episode that can be watched later from the mobile or TV app.

Stored fields:

1. `id`
2. `title`
3. `description`
4. `content_type`
5. `category_id`
6. `series_id`
7. `series`
8. `tag_ids`
9. `tags`
10. `is_premium`
11. `age_rating`
12. `duration_sec`
13. `year`
14. `published`
15. `published_at`
16. `poster`
17. `source`
18. `transcode`

Rules:

1. `id` is generated by the backend as a UUID.
2. `title` must include `en`, `ru`, and `uz`.
3. `description` must include `en`, `ru`, and `uz`.
4. `content_type` marks the content as a movie or episode.
5. `category_id` stores the selected content category id.
6. `series_id` stores the selected legacy series id when the movie is linked to a series.
7. `series` stores ids of linked movies or episodes.
8. `tag_ids` stores ids of linked content tags.
9. `tags` returns full tag objects for clients.
10. `is_premium` marks content that needs the `premium` tariff.
11. `age_rating` stores the numeric age restriction.
12. `duration_sec` stores duration in seconds.
13. `year` stores the release year.
14. `published` stores whether the content is published.
15. `published_at` stores when content was published, or `null`.
16. `poster` stores uploaded poster image details.
17. `source` stores uploaded file details.
18. `transcode` stores HLS status, the auto master playlist URL, and rendition playlist URLs.

Example:

```json
{
  "id": "7d13c3a7-07d0-4f99-81a1-fb2efc42d1d8",
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
  "year": 2026,
  "published": false,
  "published_at": null
}
```
