# API endpoints по списку задач

Формат каждого блока:

- Текст задачи
- Запрос endpoint
- Метод запроса, body, query если они есть

Base URL для нового API:

```text
/v1
```

Base URL для legacy API:

```text
/api/v1
```

Для protected endpoints:

```http
Authorization: Bearer <parentToken-or-deviceToken>
```

## 1. Недавно просмотренные пропало (родитель и ребенок)

### Текст задачи

Недавно просмотренные должны работать и для родителя, и для ребенка.

### Запрос endpoint

```http
GET /v1/watch-sessions/history
```

### Метод запроса, body, query

Method: `GET`

Auth:

- `parentToken` для родителя
- `deviceToken` для ребенка

Body: нет

Query:

| Query | Required | Описание |
| --- | --- | --- |
| `limit` | no | Количество элементов, default `20` |
| `unique` | no | `true` по умолчанию; `false`, если нужны все сессии без удаления дублей |
| `childId` / `child_id` | no | Только для `parentToken`, чтобы получить историю конкретного ребенка |

Примеры:

```http
GET /v1/watch-sessions/history?limit=20
Authorization: Bearer <deviceToken>
```

```http
GET /v1/watch-sessions/history?childId=<childId>&limit=20
Authorization: Bearer <parentToken>
```

Ответ:

```json
{
  "history": [],
  "recentlyViewed": [],
  "recently_viewed": []
}
```

Legacy endpoint, если mobile использует старый API:

```http
GET /api/v1/me/history
Authorization: Bearer <access_token>
```

## 2. Все мультфильмы должны приносить только категорию мультфильмов, не серии из сериала

### Текст задачи

Список мультфильмов должен возвращать только основные мультфильмы выбранной категории, без отдельных серий из сериалов.

### Запрос endpoint

```http
GET /v1/content/movies
```

### Метод запроса, body, query

Method: `GET`

Auth:

- `parentToken`
- `deviceToken`

Body: нет

Query:

| Query | Required | Описание |
| --- | --- | --- |
| `category` / `category_id` | yes для фильтра мультфильмов | ID категории мультфильмов |
| `page` | no | Номер страницы |
| `limit` | no | Количество элементов |
| `childId` / `child_id` | no | Для `parentToken`, чтобы применить blacklist ребенка |
| `q` / `search` | no | Поиск |
| `tags` / `tag_ids` | no | CSV список тегов |
| `liked=true` | no | Только liked |

Пример:

```http
GET /v1/content/movies?category=<cartoonCategoryId>&page=1&limit=20
Authorization: Bearer <token>
```

Важно: backend автоматически исключает серии из сериалов через `series_id` и связанные series records.

Legacy endpoint:

```http
GET /api/v1/content?kind=cartoon
Authorization: Bearer <access_token>
```

Query:

| Query | Required | Описание |
| --- | --- | --- |
| `kind=cartoon` | yes | Только мультфильмы |
| `limit` | no | Лимит |
| `offset` | no | Offset |
| `lang` | no | `ru`, `uz`, `en` |

## 3. Нужно добавить Рекомендации / Популярное в админку и подключить

### Текст задачи

Админка должна уметь создавать/редактировать рекомендации, а mobile должен получать рекомендации и популярное.

### Запрос endpoint

```http
GET /v1/recommendations
GET /v1/recommendations/popular
POST /v1/recommendations
PATCH /v1/recommendations/:recommendationId
DELETE /v1/recommendations/:recommendationId
```

### Метод запроса, body, query

Получить рекомендации:

```http
GET /v1/recommendations?limit=20
Authorization: Bearer <token>
```

Query:

| Query | Required | Описание |
| --- | --- | --- |
| `limit` | no | Количество рекомендаций |
| `admin=true` / `includeInactive=true` | no | Для админки показать inactive |

Body: нет

Получить популярное:

```http
GET /v1/recommendations/popular?limit=20
Authorization: Bearer <token>
```

Query:

| Query | Required | Описание |
| --- | --- | --- |
| `limit` | no | Количество элементов |
| `childId` / `child_id` | no | Для `parentToken`, чтобы применить фильтры ребенка |

Создать рекомендацию:

```http
POST /v1/recommendations
Authorization: Bearer <parentToken>
```

Body:

```json
{
  "type": "content",
  "referenceId": "movie-id",
  "sortOrder": 10,
  "active": true
}
```

Body fields:

| Field | Required | Описание |
| --- | --- | --- |
| `type` | yes | `category`, `content`, `movie`, `series` |
| `referenceId` / `reference_id` | yes | ID категории/контента/сериала |
| `sortOrder` / `sort_order` | no | Сортировка |
| `active` | no | Активно или нет |

Обновить:

```http
PATCH /v1/recommendations/:recommendationId
Authorization: Bearer <parentToken>
```

Body: любое из полей `type`, `referenceId`, `sortOrder`, `active`.

Удалить:

```http
DELETE /v1/recommendations/:recommendationId
Authorization: Bearer <parentToken>
```

## 4. Подключение Click и оплата

### Текст задачи

Подключить оплату через Click и проверку подписки.

### Запрос endpoint

```http
GET /v1/billing/subscription/current
POST /v1/billing/click/checkout
POST /v1/billing/click/checkout/deeplink
GET /v1/billing/click/transactions/:transactionId
POST /v1/billing/click/prepare
POST /v1/billing/click/complete
```

### Метод запроса, body, query

Текущая подписка:

```http
GET /v1/billing/subscription/current
Authorization: Bearer <token>
```

Body: нет

Query: нет

Создать Click checkout:

```http
POST /v1/billing/click/checkout
Authorization: Bearer <parentToken>
```

Body:

```json
{
  "tariff_id": "premium",
  "amount": 49000,
  "return_url": "https://example.com/payment-return"
}
```

Body fields:

| Field | Required | Описание |
| --- | --- | --- |
| `tariff_id` / `tariffId` / `plan_id` / `planId` | yes | ID тарифа |
| `amount` / `amount_uzs` / `amountUzs` | no | Сумма |
| `return_url` / `returnUrl` | no | URL возврата |
| `card_type` / `cardType` | no | Тип карты |
| `expires_at` / `expiresAt` | no | Срок действия checkout |

Создать Click deeplink:

```http
POST /v1/billing/click/checkout/deeplink
Authorization: Bearer <parentToken>
```

Body: такой же, как у `/click/checkout`.

Проверить transaction:

```http
GET /v1/billing/click/transactions/:transactionId
Authorization: Bearer <parentToken>
```

Click callbacks/webhooks:

```http
POST /v1/billing/click/prepare
POST /v1/billing/click/complete
```

Body: payload от Click provider.

Legacy Click/card endpoints, если нужна старая схема карт:

```http
POST /api/v1/payments/click/card/request
POST /api/v1/payments/click/card/verify
POST /api/v1/billing/checkout
POST /api/v1/billing/checkout/deeplink
GET /api/v1/payments/click/payment/:payment_id/status
DELETE /api/v1/payments/click/payment/:payment_id/reversal
```

## 5. Movie count time: если вышел с мультика и обратно зашел, мультик должен продолжаться с места остановки

### Текст задачи

Backend должен сохранять прогресс просмотра и возвращать позицию продолжения.

### Запрос endpoint

```http
POST /v1/watch-sessions/start
PATCH /v1/watch-sessions/:watchSessionId/progress
PATCH /v1/watch-sessions/:watchSessionId/stop
GET /v1/watch-sessions/progress/:contentId
```

### Метод запроса, body, query

Старт просмотра:

```http
POST /v1/watch-sessions/start
Authorization: Bearer <token>
```

Body:

```json
{
  "contentId": "movie-id"
}
```

Ответ содержит:

```json
{
  "watchSession": {
    "id": "watch-session-id",
    "resumePositionSeconds": 120,
    "resume_position_sec": 120,
    "remainingSecondsToday": 2400
  }
}
```

Mobile должен начинать player с `resumePositionSeconds`.

Сохранить progress:

```http
PATCH /v1/watch-sessions/:watchSessionId/progress
Authorization: Bearer <token>
```

Body:

```json
{
  "watchedSec": 60,
  "positionSec": 180
}
```

Aliases:

| Field | Alias |
| --- | --- |
| `watchedSec` | `watchedSeconds`, `watched_sec` |
| `positionSec` | `positionSeconds`, `position_sec` |

Остановить просмотр:

```http
PATCH /v1/watch-sessions/:watchSessionId/stop
Authorization: Bearer <token>
```

Body: нет

Получить progress без старта:

```http
GET /v1/watch-sessions/progress/:contentId
Authorization: Bearer <token>
```

Query:

| Query | Required | Описание |
| --- | --- | --- |
| `childId` / `child_id` | no | Только для `parentToken` |

## 6. Комментарии не парсят полное ФИО и аватарку

### Текст задачи

Комментарии должны возвращать полное ФИО и аватарку автора.

### Запрос endpoint

```http
GET /api/v1/content/:id/comments
POST /api/v1/content/:id/comments
PUT /api/v1/comments/:id
DELETE /api/v1/comments/:id
```

### Метод запроса, body, query

Получить комментарии:

```http
GET /api/v1/content/:id/comments?limit=20&offset=0
```

Query:

| Query | Required | Описание |
| --- | --- | --- |
| `limit` | no | Количество |
| `offset` | no | Offset |

Body: нет

Ответ теперь содержит поля автора:

```json
{
  "user_full_name": "First Last",
  "full_name": "First Last",
  "avatar_url": "/media/...",
  "author": {
    "id": "user-id",
    "name": "First",
    "last_name": "Last",
    "full_name": "First Last",
    "avatar_url": "/media/..."
  }
}
```

Создать комментарий:

```http
POST /api/v1/content/:id/comments
Authorization: Bearer <access_token>
```

Body:

```json
{
  "body": "Комментарий"
}
```

Обновить:

```http
PUT /api/v1/comments/:id
Authorization: Bearer <access_token>
```

Body:

```json
{
  "body": "Новый текст"
}
```

Удалить:

```http
DELETE /api/v1/comments/:id
Authorization: Bearer <access_token>
```

## 7. Подключить Firebase и push + email уведомления

### Текст задачи

Mobile должен регистрировать push token, backend должен отправлять push и email уведомления.

### Запрос endpoint

```http
POST /v1/notifications/device-token
GET /v1/notifications
POST /v1/notifications/push
POST /v1/notifications/email
```

### Метод запроса, body, query

Зарегистрировать FCM/APNs token:

```http
POST /v1/notifications/device-token
Authorization: Bearer <parentToken-or-deviceToken>
```

Body:

```json
{
  "token": "fcm-token",
  "platform": "ios",
  "enabled": true
}
```

Список уведомлений:

```http
GET /v1/notifications
Authorization: Bearer <token>
```

Body: нет

Отправить push:

```http
POST /v1/notifications/push
Authorization: Bearer <parentToken>
```

Body:

```json
{
  "title": "Лимит скоро закончится",
  "body": "Осталось 5 минут",
  "childId": "child-id",
  "data": {
    "type": "watch_limit"
  }
}
```

Body fields:

| Field | Required | Описание |
| --- | --- | --- |
| `title` | yes | Заголовок |
| `body` | yes | Текст |
| `childId` / `child_id` | no | Отправить только устройствам ребенка |
| `data` | no | Custom payload |

Отправить email:

```http
POST /v1/notifications/email
Authorization: Bearer <parentToken>
```

Body:

```json
{
  "to": "parent@example.com",
  "subject": "Astir",
  "text": "Message text",
  "html": "<p>Message</p>"
}
```

Нужные env:

```text
FIREBASE_SERVER_KEY=
FIREBASE_API_URL=https://fcm.googleapis.com/fcm/send
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SECURE=false
```

## 8. Лимиты ребенка, backend отправляет break ошибку, mobile нужно исправить

### Текст задачи

Mobile должен понимать ошибку лимита и отключать просмотр. Backend возвращает structured error.

### Запрос endpoint

```http
PUT /v1/children/:childId/limits
GET /v1/children/:childId/limits
POST /v1/watch-sessions/start
PATCH /v1/watch-sessions/:watchSessionId/progress
GET /v1/device/config
```

### Метод запроса, body, query

Задать лимиты:

```http
PUT /v1/children/:childId/limits
Authorization: Bearer <parentToken>
```

Body:

```json
{
  "dailyMinutes": 60,
  "allowedFrom": "08:00",
  "allowedTo": "20:00",
  "allowedDays": [1, 2, 3, 4, 5, 6, 7]
}
```

Получить лимиты:

```http
GET /v1/children/:childId/limits
Authorization: Bearer <parentToken>
```

Получить лимиты с детского устройства:

```http
GET /v1/device/config
Authorization: Bearer <deviceToken>
```

Где приходит ошибка лимита:

```http
POST /v1/watch-sessions/start
PATCH /v1/watch-sessions/:watchSessionId/progress
```

Формат ошибки:

```json
{
  "code": "WATCH_LIMIT_REACHED",
  "message": "Daily watch limit reached",
  "statusCode": 403,
  "error": {
    "code": "WATCH_LIMIT_REACHED",
    "message": "Daily watch limit reached",
    "statusCode": 403
  }
}
```

Mobile должен отключать player при:

| Code | Что делать |
| --- | --- |
| `WATCH_LIMIT_REACHED` | Закрыть player, показать экран лимита |
| `WATCH_TIME_BLOCKED` | Закрыть player, показать экран недоступного времени |
| `WATCH_DAY_BLOCKED` | Закрыть player, показать экран недоступного дня |
| `CONTENT_BLACKLISTED` | Не запускать контент |

Legacy stream endpoint тоже возвращает limit errors:

```http
GET /api/v1/stream/:id/grant
Authorization: Bearer <access_token>
```

Legacy codes:

```text
watch_limit_reached
watch_time_blocked
watch_day_blocked
```

## 9. Часто задаваемые вопросы в FAQ

### Текст задачи

Добавить FAQ, чтобы mobile получал список вопросов, а админка могла управлять FAQ.

### Запрос endpoint

```http
GET /v1/faqs
POST /v1/faqs
PATCH /v1/faqs/:faqId
DELETE /v1/faqs/:faqId
```

### Метод запроса, body, query

Получить FAQ:

```http
GET /v1/faqs
```

Body: нет

Query:

| Query | Required | Описание |
| --- | --- | --- |
| `admin=true` | no | Показать inactive для админки |
| `includeInactive=true` | no | То же самое |

Создать FAQ:

```http
POST /v1/faqs
Authorization: Bearer <parentToken>
```

Body:

```json
{
  "question": {
    "ru": "Как подключить ребенка?",
    "uz": "Bolani qanday ulash mumkin?",
    "en": "How to pair a child?"
  },
  "answer": {
    "ru": "Откройте детское приложение и подтвердите код.",
    "uz": "Bolalar ilovasini oching va kodni tasdiqlang.",
    "en": "Open the child app and confirm the code."
  },
  "sortOrder": 1,
  "active": true
}
```

Body fields:

| Field | Required | Описание |
| --- | --- | --- |
| `question` | yes | Localized object |
| `answer` | yes | Localized object |
| `sortOrder` / `sort_order` | no | Сортировка |
| `active` | no | Активно или нет |

Обновить:

```http
PATCH /v1/faqs/:faqId
Authorization: Bearer <parentToken>
```

Body: любое из полей `question`, `answer`, `sortOrder`, `active`.

Удалить:

```http
DELETE /v1/faqs/:faqId
Authorization: Bearer <parentToken>
```

## 10. Офлайн просмотр: описание, постер, просмотры должно сохранить в кэше мобайла

### Текст задачи

Mobile должен получить все данные для offline cache: описание, постер, просмотры, watch time, playback и cache key.

### Запрос endpoint

```http
GET /v1/content/movies/:movie_id/offline
```

### Метод запроса, body, query

Method: `GET`

Auth:

- `parentToken`
- `deviceToken`

Body: нет

Query:

| Query | Required | Описание |
| --- | --- | --- |
| `childId` / `child_id` | no | Только для `parentToken`, чтобы применить blacklist ребенка |

Пример:

```http
GET /v1/content/movies/:movie_id/offline?childId=<childId>
Authorization: Bearer <parentToken>
```

Ответ:

```json
{
  "movie": {},
  "offline": {
    "contentId": "movie-id",
    "content_id": "movie-id",
    "title": {},
    "description": {},
    "poster_url": "/media/...",
    "poster": "/media/...",
    "views_count": 10,
    "play_count": 10,
    "watch_time_sec": 120,
    "duration_sec": 600,
    "duration_seconds": 600,
    "playback": {},
    "cache_key": "movie-id:updated-at",
    "updatedAt": "2026-06-11T00:00:00.000Z"
  },
  "cache": {}
}
```

Mobile cache должен сохранить:

| Field | Для чего |
| --- | --- |
| `title` | Название |
| `description` | Описание |
| `poster_url` / `poster` | Постер |
| `views_count` / `play_count` | Просмотры |
| `watch_time_sec` | Общее watch time |
| `duration_sec` | Длина видео |
| `playback` | Данные проигрывания |
| `cache_key` | Ключ invalidation cache |
| `updatedAt` | Дата обновления |

