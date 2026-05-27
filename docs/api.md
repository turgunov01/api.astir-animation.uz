# API Notes

Base path:

```text
/v1
```

All API responses are JSON.

Swagger is available here when the server is running:

```text
http://127.0.0.1:3000/api-docs
```

The raw OpenAPI file is available here:

```text
http://127.0.0.1:3000/openapi.json
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

## 13. Start A Watch Session

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

## 14. Stop A Watch Session

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
    "message": "Email is required"
  }
}
```
