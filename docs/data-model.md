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

Stored fields:

1. `id`
2. `name`
3. `email`
4. `passwordHash`
5. `pinHash`
6. `createdAt`
7. `updatedAt`

## 2. Child

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

## 3. Device

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

## 4. Pairing Session

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

## 5. Watch Limit

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

## 6. Watch Session

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

## 7. Content Item

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
