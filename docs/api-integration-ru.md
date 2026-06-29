# Инструкция по подключению Astir API

Этот документ предназначен для mobile, web/admin и backend-интеграций. Основной новый API находится на `/v1`. Старый совместимый Streaming API находится отдельно на `/api/v1`.

## 1. Базовые адреса

Локально:

```text
http://127.0.0.1:2048
```

Основной API:

```text
http://127.0.0.1:2048/v1
```

Legacy API:

```text
http://127.0.0.1:2048/api/v1
```

Swagger:

```text
http://127.0.0.1:2048/index.html
http://127.0.0.1:2048/api-docs
http://127.0.0.1:2048/legacy-api-docs
```

OpenAPI JSON:

```text
http://127.0.0.1:2048/openapi.json
http://127.0.0.1:2048/legacy-doc.json
```

Health check:

```http
GET /health
```

## 2. Заголовки

Для JSON-запросов:

```http
Content-Type: application/json
Accept: application/json
```

Для авторизованных запросов:

```http
Authorization: Bearer <token>
```

Есть два типа токенов:

| Токен | Кто использует | Где получить |
| --- | --- | --- |
| `parentToken` | Родительское приложение, админские действия | `/v1/auth/register` или `/v1/auth/login` |
| `deviceToken` | Детское/TV приложение после pairing | `/v1/pairing/sessions/:sessionId` после approve |

Для upload endpoints используется `multipart/form-data`.

## 3. Ошибки

Новый `/v1` API возвращает ошибку в таком виде:

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

Mobile должен читать сначала top-level `code`. Для детских лимитов отключать просмотр при:

| Code | Что значит | Что делать в mobile |
| --- | --- | --- |
| `WATCH_LIMIT_REACHED` | Дневной лимит закончился | Закрыть/заблокировать player |
| `WATCH_TIME_BLOCKED` | Сейчас не разрешенное время просмотра | Закрыть/заблокировать player |
| `WATCH_DAY_BLOCKED` | Сегодня день не разрешен | Закрыть/заблокировать player |
| `CONTENT_BLACKLISTED` | Контент заблокирован ребенку | Не показывать/не запускать контент |
| `PREMIUM_TARIFF_REQUIRED` | Нужен premium тариф | Показать paywall |

Эти ошибки могут прийти при:

```http
POST /v1/watch-sessions/start
PATCH /v1/watch-sessions/:watchSessionId/progress
GET /api/v1/stream/:id/grant
```

## 4. Environment

Минимальные переменные:

```text
REQUIRE_AUTH=true
HOST=127.0.0.1
PORT=2048
JWT_SECRET=change-this-secret
PARENT_TOKEN_TTL=7d
DEVICE_TOKEN_TTL=365d
DATA_FILE=data/store.json
CONTENT_STORAGE=postgres
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/astir
MEDIA_ROOT=media
```

Для OTP/email:

```text
OTP_DEFAULT_CODE=
OTP_DEBUG=false
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SECURE=false
```

Для Firebase:

```text
FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/firebase-service-account.json
FIREBASE_PROJECT_ID=astiranimation
FIREBASE_API_URL=https://fcm.googleapis.com/v1/projects/astiranimation/messages:send
CHILD_APP_OPEN_NOTIFICATION_COOLDOWN_SECONDS=300
```

Для Click:

```text
CLICK_BASE_URL=
CLICK_PAYMENT_URL=https://my.click.uz/services/pay
CLICK_MERCHANT_ID=
CLICK_MERCHANT_USER_ID=
CLICK_SERVICE_ID=
CLICK_SECRET_KEY=
CLICK_RETURN_URL=
CLICK_DEFAULT_SUBSCRIPTION_DAYS=30
```

## 5. Быстрый старт backend

```bash
npm install
npm run db:migrate
npm run db:seed
npm run .
```

Проверка:

```bash
npm test
npm run test:legacy
npm run test:auth-off
```

## 6. Auth API

### 6.1 Запрос OTP

```http
POST /v1/auth/otp/request
```

```json
{
  "email": "parent@example.com"
}
```

Ответ:

```json
{
  "sent": true
}
```

В dev можно задать `OTP_DEFAULT_CODE`, тогда код фиксированный.

### 6.2 Проверка OTP

```http
POST /v1/auth/otp/verify
```

```json
{
  "email": "parent@example.com",
  "code": "123456"
}
```

Ответ:

```json
{
  "email": "parent@example.com",
  "verified": true,
  "emailExists": false
}
```

### 6.3 Регистрация родителя

```http
POST /v1/auth/register
```

```json
{
  "name": "Parent",
  "email": "parent@example.com",
  "password": "password123",
  "pin": "1234"
}
```

Ответ:

```json
{
  "parent": {
    "id": "parent-id",
    "name": "Parent",
    "email": "parent@example.com",
    "tariff": "free"
  },
  "token": "parentToken"
}
```

### 6.4 Логин родителя

```http
POST /v1/auth/login
```

```json
{
  "email": "parent@example.com",
  "password": "password123"
}
```

Ответ содержит `parent` и `token`.

### 6.5 Текущий родитель

```http
GET /v1/auth/me
Authorization: Bearer <parentToken>
```

### 6.6 Проверка PIN

```http
POST /v1/auth/pin/verify
Authorization: Bearer <parentToken>
```

```json
{
  "pin": "1234"
}
```

Ответ:

```json
{
  "verified": true
}
```

## 7. Дети и лимиты

Все endpoints в этом блоке требуют `parentToken`.

| Method | URL | Назначение |
| --- | --- | --- |
| `GET` | `/v1/children` | Список детей |
| `POST` | `/v1/children` | Создать ребенка |
| `GET` | `/v1/children/:childId` | Получить ребенка |
| `GET` | `/v1/children/:childId/limits` | Получить лимиты |
| `PUT` | `/v1/children/:childId/limits` | Обновить лимиты |
| `GET` | `/v1/children/:childId/blacklist` | Черный список ребенка |
| `POST` | `/v1/children/:childId/blacklist` | Добавить контент в blacklist |
| `DELETE` | `/v1/children/:childId/blacklist/:contentId` | Удалить из blacklist |

Создать ребенка:

```http
POST /v1/children
Authorization: Bearer <parentToken>
```

```json
{
  "name": "Child",
  "birthYear": 2018
}
```

Обновить лимиты:

```http
PUT /v1/children/:childId/limits
Authorization: Bearer <parentToken>
```

```json
{
  "dailyMinutes": 60,
  "allowedFrom": "08:00",
  "allowedTo": "20:00",
  "allowedDays": [1, 2, 3, 4, 5, 6, 7]
}
```

`allowedDays`: 1 = Monday, 7 = Sunday.

Добавить blacklist:

```http
POST /v1/children/:childId/blacklist
Authorization: Bearer <parentToken>
```

```json
{
  "contentId": "movie-id"
}
```

## 8. Pairing детского/TV устройства

### 8.1 Детское устройство создает session

```http
POST /v1/pairing/sessions
```

```json
{
  "deviceName": "iPhone Child",
  "platform": "ios"
}
```

Ответ:

```json
{
  "pairingSession": {
    "id": "session-id",
    "code": "123456",
    "setupToken": "setup-token",
    "status": "pending",
    "expiresAt": "2026-06-11T10:00:00.000Z",
    "qrPayload": {
      "type": "astir-pairing",
      "sessionId": "session-id",
      "code": "123456"
    }
  }
}
```

Mobile должен сохранить `sessionId` и `setupToken`.

### 8.2 Родитель подтверждает pairing

```http
POST /v1/pairing/sessions/:sessionId/approve
Authorization: Bearer <parentToken>
```

```json
{
  "childId": "child-id"
}
```

### 8.3 Детское устройство poll status

```http
GET /v1/pairing/sessions/:sessionId
x-setup-token: <setupToken>
```

Если `status=approved`, ответ содержит:

```json
{
  "pairingSession": {
    "id": "session-id",
    "status": "approved",
    "deviceToken": "deviceToken",
    "deviceId": "device-id",
    "childId": "child-id"
  }
}
```

После этого детское приложение использует:

```http
Authorization: Bearer <deviceToken>
```

## 9. Device config

```http
GET /v1/device/config
Authorization: Bearer <deviceToken>
```

Ответ содержит `device`, `child`, `limit`, `blacklist`.

## 10. Каталог и контент

Endpoints требуют `parentToken` или `deviceToken`, если не указано иначе.

### 10.1 Список контента

```http
GET /v1/content
GET /v1/content/movies
```

Query:

| Параметр | Описание |
| --- | --- |
| `q` или `search` | Поиск |
| `category` или `category_id` | Фильтр категории |
| `tags` или `tag_ids` | CSV список tag ids |
| `liked=true` | Только liked |
| `page` | Страница |
| `limit` | Лимит |
| `childId` или `child_id` | Для parentToken показать каталог глазами ребенка |

Пример:

```http
GET /v1/content/movies?category=cartoons&childId=child-id&page=1&limit=20
Authorization: Bearer <parentToken>
```

Для `deviceToken` `childId` не нужен, ребенок берется из pairing.

### 10.2 Детали фильма

```http
GET /v1/content/movies/:movie_id
Authorization: Bearer <token>
```

Для parentToken можно передать:

```text
?childId=child-id
```

### 10.3 Серии фильма/сериала

```http
GET /v1/content/movies/:movie_id/series
Authorization: Bearer <token>
```

### 10.4 Популярное

```http
GET /v1/content/movies/popular?limit=20
Authorization: Bearer <token>
```

Также доступно:

```http
GET /v1/recommendations/popular?limit=20
Authorization: Bearer <token>
```

### 10.5 Offline cache payload

```http
GET /v1/content/movies/:movie_id/offline
Authorization: Bearer <token>
```

Ответ:

```json
{
  "movie": {},
  "offline": {
    "contentId": "movie-id",
    "title": {},
    "description": {},
    "poster_url": "/media/...",
    "views_count": 10,
    "watch_time_sec": 120,
    "duration_sec": 600,
    "playback": {},
    "cache_key": "movie-id:updated-at",
    "updatedAt": "2026-06-11T00:00:00.000Z"
  },
  "cache": {}
}
```

Mobile должен сохранять `offline`/`cache`: title, description, poster, views/watch stats, playback и `cache_key`.

### 10.6 Likes

| Method | URL | Назначение |
| --- | --- | --- |
| `GET` | `/v1/content/likes` | Мои liked items |
| `GET` | `/v1/content/:content_id/like` | Проверить like |
| `POST` | `/v1/content/:content_id/like` | Поставить like |
| `DELETE` | `/v1/content/:content_id/like` | Убрать like |

### 10.7 Blacklist через content API

Можно использовать как parentToken, так и deviceToken.

| Method | URL |
| --- | --- |
| `GET` | `/v1/content/:content_id/blacklist` |
| `POST` | `/v1/content/:content_id/blacklist` |
| `DELETE` | `/v1/content/:content_id/blacklist` |

Для parentToken обязательно передавать `childId` или `child_id` в body/query.

## 11. Admin/content management

Эти endpoints требуют `parentToken`. Сейчас отдельной role-check админки в `/v1` нет, поэтому подключать их в admin UI надо через parent/admin token текущего backend.

### 11.1 Movies

| Method | URL | Body |
| --- | --- | --- |
| `POST` | `/v1/content/movies/create` | `multipart/form-data` |
| `PATCH` | `/v1/content/movies/:movie_id` | JSON или `multipart/form-data` |
| `POST` | `/v1/content/movies/:movie_id/poster` | `multipart/form-data` |
| `PUT` | `/v1/content/movies/:movie_id/tags` | JSON |
| `POST` | `/v1/content/movies/:movie_id/series` | `multipart/form-data` |
| `DELETE` | `/v1/content/movies/:movie_id` | - |

Создание фильма:

```http
POST /v1/content/movies/create
Authorization: Bearer <parentToken>
Content-Type: multipart/form-data
```

Fields:

| Field | Type | Required |
| --- | --- | --- |
| `title` | JSON localized object | yes |
| `description` | JSON localized object | yes |
| `video` | file | optional |
| `poster` | file | optional |
| `category_id` | string | optional |
| `series_id` | string | optional |
| `tag_ids` | JSON array | optional |
| `is_premium` | boolean | optional |
| `published` | boolean | optional |
| `duration_sec` | number | optional |
| `age_rating` | number | optional |
| `year` | number | optional |

Пример localized object:

```json
{
  "ru": "Название",
  "uz": "Nomi",
  "en": "Title"
}
```

### 11.2 Categories

| Method | URL |
| --- | --- |
| `GET` | `/v1/content/categories` |
| `GET` | `/v1/content/categories/:category_id` |
| `POST` | `/v1/content/categories/create` |
| `PATCH` | `/v1/content/categories/:category_id` |
| `DELETE` | `/v1/content/categories/:category_id` |

Create body can be `multipart/form-data` with `icon`, `title`, `description`, `type`, `slug`, `active`.

### 11.3 Tags

| Method | URL |
| --- | --- |
| `GET` | `/v1/content/tags` |
| `GET` | `/v1/content/tags/:tag_id` |
| `POST` | `/v1/content/tags/create` |
| `PATCH` | `/v1/content/tags/:tag_id` |
| `DELETE` | `/v1/content/tags/:tag_id` |

Create tag:

```json
{
  "name": "Popular",
  "slug": "popular",
  "active": true
}
```

## 12. Watch sessions, история и продолжение просмотра

Endpoints требуют `parentToken` или `deviceToken`.

### 12.1 Старт просмотра

```http
POST /v1/watch-sessions/start
Authorization: Bearer <token>
```

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
    "contentId": "movie-id",
    "resumePositionSeconds": 120,
    "resume_position_sec": 120,
    "remainingSecondsToday": 2400,
    "content": {}
  }
}
```

Mobile должен начать playback с `resumePositionSeconds`.

### 12.2 Прогресс

```http
PATCH /v1/watch-sessions/:watchSessionId/progress
Authorization: Bearer <token>
```

```json
{
  "watchedSec": 60,
  "positionSec": 180
}
```

Aliases:

```text
watchedSeconds, watched_sec
positionSeconds, position_sec
```

Отправлять каждые 10-30 секунд и при pause/background.

### 12.3 Stop

```http
PATCH /v1/watch-sessions/:watchSessionId/stop
Authorization: Bearer <token>
```

### 12.4 Недавно просмотренные

```http
GET /v1/watch-sessions/history?limit=20&unique=true
Authorization: Bearer <token>
```

Для parentToken можно получить историю конкретного ребенка:

```http
GET /v1/watch-sessions/history?childId=child-id
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

### 12.5 Получить позицию для контента

```http
GET /v1/watch-sessions/progress/:contentId
Authorization: Bearer <token>
```

Для parentToken:

```text
?childId=child-id
```

Ответ:

```json
{
  "progress": {
    "contentId": "movie-id",
    "positionSeconds": 120,
    "watchedSeconds": 180,
    "watchSessionId": "watch-session-id",
    "updatedAt": "2026-06-11T00:00:00.000Z"
  }
}
```

## 13. Рекомендации и популярное

Endpoints требуют `parentToken` или `deviceToken`, кроме CRUD, где нужен `parentToken`.

| Method | URL | Назначение |
| --- | --- | --- |
| `GET` | `/v1/recommendations` | Список рекомендаций |
| `GET` | `/v1/recommendations/popular` | Популярное |
| `POST` | `/v1/recommendations` | Создать рекомендацию |
| `PATCH` | `/v1/recommendations/:recommendationId` | Обновить |
| `DELETE` | `/v1/recommendations/:recommendationId` | Удалить |

Создать:

```http
POST /v1/recommendations
Authorization: Bearer <parentToken>
```

```json
{
  "type": "content",
  "referenceId": "movie-id",
  "sortOrder": 10,
  "active": true
}
```

`type`: `category`, `content`, `movie`, `series`. `movie` нормализуется как `content`.

Admin list with inactive:

```http
GET /v1/recommendations?admin=true
Authorization: Bearer <parentToken>
```

## 14. FAQ

| Method | URL | Auth | Назначение |
| --- | --- | --- | --- |
| `GET` | `/v1/faqs` | public | Активные FAQ |
| `POST` | `/v1/faqs` | parentToken | Создать |
| `PATCH` | `/v1/faqs/:faqId` | parentToken | Обновить |
| `DELETE` | `/v1/faqs/:faqId` | parentToken | Удалить |

Получить все для админки:

```http
GET /v1/faqs?admin=true
Authorization: Bearer <parentToken>
```

Создать:

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

## 15. Notifications, Firebase push и email

### 15.1 Регистрация FCM/APNs token

```http
POST /v1/notifications/device-token
Authorization: Bearer <parentToken-or-deviceToken>
```

```json
{
  "token": "fcm-token",
  "platform": "ios",
  "enabled": true
}
```

Если токен регистрирует детское устройство, backend сохранит `childId`.

### 15.2 Список уведомлений

```http
GET /v1/notifications
Authorization: Bearer <token>
```

### 15.3 Отправить push

```http
POST /v1/notifications/push
Authorization: Bearer <parentToken>
```

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

Если `FIREBASE_PROJECT_ID` или `FIREBASE_SERVICE_ACCOUNT_PATH` не заданы, backend сохранит уведомление и вернет `skipped=true`.

### 15.4 Отправить email

```http
POST /v1/notifications/email
Authorization: Bearer <parentToken>
```

```json
{
  "to": "parent@example.com",
  "subject": "Astir",
  "text": "Message text",
  "html": "<p>Message</p>"
}
```

Нужны SMTP переменные в `.env`.

## 16. Тарифы

| Method | URL | Auth | Назначение |
| --- | --- | --- | --- |
| `GET` | `/v1/tariffs` | public | Список тарифов |
| `GET` | `/v1/tariffs/:tariff_id` | public | Детали тарифа |
| `POST` | `/v1/tariffs/create` | parentToken | Создать тариф |
| `PATCH` | `/v1/tariffs/:tariff_id` | parentToken | Обновить тариф |
| `DELETE` | `/v1/tariffs/:tariff_id` | parentToken | Удалить тариф |
| `GET` | `/v1/tariffs/current` | parent/device token | Текущий тариф |
| `PATCH` | `/v1/tariffs/current` | parentToken | Установить текущий тариф |

Создать тариф:

```json
{
  "id": "premium",
  "title": {
    "ru": "Premium",
    "uz": "Premium",
    "en": "Premium"
  },
  "description": {
    "ru": "Все мультфильмы",
    "uz": "Barcha multfilmlar",
    "en": "All cartoons"
  },
  "price": 49000,
  "currency": "UZS",
  "is_default": false,
  "can_watch_premium": true
}
```

Установить текущий:

```http
PATCH /v1/tariffs/current
Authorization: Bearer <parentToken>
```

```json
{
  "tariff": "premium"
}
```

## 17. Billing и оплата

### 17.1 Текущая подписка

```http
GET /v1/billing/subscription/current
Authorization: Bearer <parentToken-or-deviceToken>
```

### 17.2 Click checkout

```http
POST /v1/billing/click/checkout
Authorization: Bearer <parentToken>
```

```json
{
  "tariff_id": "premium",
  "amount": 49000,
  "return_url": "https://example.com/payment-return"
}
```

Для deeplink:

```http
POST /v1/billing/click/checkout/deeplink
Authorization: Bearer <parentToken>
```

Статус transaction:

```http
GET /v1/billing/click/transactions/:transactionId
Authorization: Bearer <parentToken>
```

Click webhooks:

```http
POST /v1/billing/click/prepare
POST /v1/billing/click/complete
```

### 17.3 In-app purchases

Apple:

```http
POST /v1/billing/apple/verify
Authorization: Bearer <parentToken>
```

```json
{
  "tariff_id": "premium",
  "receipt": "apple-receipt",
  "product_id": "premium_month",
  "transaction_id": "transaction-id"
}
```

Google:

```http
POST /v1/billing/google/verify
Authorization: Bearer <parentToken>
```

```json
{
  "tariff_id": "premium",
  "purchase_token": "google-purchase-token",
  "product_id": "premium_month"
}
```

Provider webhooks:

```http
POST /v1/billing/webhook/apple
POST /v1/billing/webhook/google
```

## 18. Legacy `/api/v1` API

Legacy API нужен для совместимости со старым Astir Streaming API. Полная схема:

```text
http://127.0.0.1:2048/legacy-api-docs
http://127.0.0.1:2048/legacy-doc.json
```

Основные mobile/admin endpoints:

| Method | URL | Назначение |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | Legacy login |
| `POST` | `/api/v1/auth/register` | Legacy register |
| `POST` | `/api/v1/auth/refresh` | Refresh token |
| `GET` | `/api/v1/auth/me` | Current user |
| `GET` | `/api/v1/children` | Дети родителя |
| `POST` | `/api/v1/children` | Создать ребенка |
| `GET` | `/api/v1/children/:id/permissions` | Лимиты/permissions |
| `POST` | `/api/v1/children/:id/permissions` | Создать permission |
| `PUT` | `/api/v1/children/:id/permissions/:rule_id` | Обновить permission |
| `POST` | `/api/v1/auth/child/init` | Child pairing init |
| `POST` | `/api/v1/auth/child/confirm` | Child pairing confirm |
| `GET` | `/api/v1/auth/child/:device_id/status` | Child pairing status |
| `POST` | `/api/v1/auth/tv/init` | TV pairing init |
| `POST` | `/api/v1/auth/tv/confirm` | TV pairing confirm |
| `GET` | `/api/v1/auth/tv/:device_id/status` | TV pairing status |
| `GET` | `/api/v1/content` | Контент + series cards |
| `GET` | `/api/v1/content/movies` | Контент |
| `GET` | `/api/v1/content/:id` | Детали |
| `GET` | `/api/v1/content/:id/comments` | Комментарии |
| `POST` | `/api/v1/content/:id/comments` | Добавить комментарий |
| `PUT` | `/api/v1/comments/:id` | Обновить комментарий |
| `DELETE` | `/api/v1/comments/:id` | Удалить комментарий |
| `GET` | `/api/v1/stream/:id/grant` | Получить signed playback URL |
| `PUT` | `/api/v1/stream/:id/progress` | Сохранить progress |
| `GET` | `/api/v1/me/history` | История просмотра |
| `GET` | `/api/v1/faqs` | FAQ |
| `GET` | `/api/v1/recommendations` | Рекомендации |
| `GET` | `/api/v1/recommendations/personalized` | Персональные рекомендации |
| `GET` | `/api/v1/cards` | Карты пользователя |
| `POST` | `/api/v1/cards` | Добавить карту |
| `POST` | `/api/v1/payments/click/card/request` | Click card token request |
| `POST` | `/api/v1/payments/click/card/verify` | Click card token verify |
| `POST` | `/api/v1/billing/checkout` | Click checkout |
| `POST` | `/api/v1/billing/checkout/deeplink` | Click checkout deeplink |
| `GET` | `/api/v1/billing/subscriptions` | Subscriptions |
| `GET` | `/api/v1/billing/transactions` | Transactions |

Legacy auth также использует:

```http
Authorization: Bearer <access_token>
```

## 19. Рекомендуемые mobile flows

### 19.1 Родительское приложение

1. `POST /v1/auth/otp/request`
2. `POST /v1/auth/otp/verify`
3. `POST /v1/auth/register` или `POST /v1/auth/login`
4. Сохранить `parentToken`.
5. `GET /v1/children`
6. `POST /v1/children`, если детей нет.
7. `PUT /v1/children/:childId/limits`
8. `POST /v1/pairing/sessions/:sessionId/approve`, когда ребенок показывает pairing code.
9. `GET /v1/watch-sessions/history?childId=:childId`
10. `GET /v1/billing/subscription/current`

### 19.2 Детское приложение

1. `POST /v1/pairing/sessions`
2. Показать `code` или QR из `qrPayload`.
3. Poll `GET /v1/pairing/sessions/:sessionId` с `x-setup-token`.
4. Когда `approved`, сохранить `deviceToken`.
5. `GET /v1/device/config`
6. `GET /v1/content/movies`
7. Перед playback: `POST /v1/watch-sessions/start`.
8. Если пришел limit error, отключить player.
9. Начать video с `resumePositionSeconds`.
10. Во время просмотра: `PATCH /v1/watch-sessions/:id/progress`.
11. При выходе: `PATCH /v1/watch-sessions/:id/stop`.

### 19.3 Offline viewing

1. Перед загрузкой вызвать `GET /v1/content/movies/:movie_id/offline`.
2. Сохранить `offline.title`, `offline.description`, `offline.poster_url`, `offline.views_count`, `offline.watch_time_sec`, `offline.playback`, `offline.cache_key`.
3. Если `cache_key` изменился, обновить локальный cache.
4. Локальный progress после offline просмотра отправить через `PATCH /v1/watch-sessions/:id/progress`, когда сеть вернулась.

### 19.4 Admin panel

1. Login через `/v1/auth/login`.
2. Категории: `/v1/content/categories`.
3. Теги: `/v1/content/tags`.
4. Контент: `/v1/content/movies/create`, `/v1/content/movies/:id`.
5. Рекомендации: `/v1/recommendations?admin=true`.
6. FAQ: `/v1/faqs?admin=true`.
7. Тарифы: `/v1/tariffs`.
8. Платежи/legacy admin при необходимости смотреть в `/legacy-api-docs`.

## 20. Минимальный JS client example

```js
const API_URL = "http://127.0.0.1:2048/v1";

async function api(path, { token, method = "GET", body } = {}) {
  const headers = {
    Accept: "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || "API request failed");
    error.code = data?.code || data?.error?.code;
    error.statusCode = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function startChildPlayback(deviceToken, contentId) {
  try {
    const { watchSession } = await api("/watch-sessions/start", {
      token: deviceToken,
      method: "POST",
      body: { contentId }
    });

    return watchSession;
  } catch (error) {
    if ([
      "WATCH_LIMIT_REACHED",
      "WATCH_TIME_BLOCKED",
      "WATCH_DAY_BLOCKED",
      "CONTENT_BLACKLISTED"
    ].includes(error.code)) {
      return { blocked: true, reason: error.code };
    }

    throw error;
  }
}
```
