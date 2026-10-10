# Sign in with Apple и удаление аккаунта: инструкция для iOS

Документ описывает изменения в iOS-приложении, которые нужны после отказа App Review:
- **2.1(a)**: вход через Apple падал с ошибкой Firebase `invalid-credential`;
- **5.1.1(v)**: пользователь должен иметь возможность удалить аккаунт в приложении.

## 1. Вход через Apple без Firebase

Токен Apple отправляется **напрямую на бэкенд**, Firebase Auth для Apple больше не используется.

`POST /api/v1/auth/apple`

```json
{
  "identity_token": "<credential.identityToken как UTF-8 строка>",
  "authorization_code": "<credential.authorizationCode как UTF-8 строка>",
  "given_name": "<fullName.givenName, только при первом входе>",
  "family_name": "<fullName.familyName, только при первом входе>",
  "email": "<credential.email, только при первом входе>"
}
```

Ответ такой же, как у `/auth/login`: `access_token`, `refresh_token`, `user`.

- `authorization_code` нужно передавать **обязательно**. По нему сервер получает у Apple токен, который отзывается при удалении аккаунта.
- Имя и email Apple присылает только при **первом** входе, поэтому передавайте их сразу.
- `aud` в токене равен Bundle ID приложения. Он должен быть указан в `APPLE_CLIENT_IDS` на сервере.

```swift
let request = ASAuthorizationAppleIDProvider().createRequest()
request.requestedScopes = [.fullName, .email]
// ...
func authorizationController(controller: ASAuthorizationController,
                             didCompleteWithAuthorization auth: ASAuthorization) {
    guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
          let idToken = cred.identityToken.flatMap({ String(data: $0, encoding: .utf8) }),
          let code = cred.authorizationCode.flatMap({ String(data: $0, encoding: .utf8) })
    else { return }
    // POST /api/v1/auth/apple с identity_token, authorization_code, given_name, family_name, email
}
```

## 2. Удаление аккаунта

`DELETE /api/v1/auth/me` с заголовком `Authorization: Bearer <access_token>`.

Ответ: `{ "deleted": true, "apple_revoked": true }`. Удаляются пользователь, его дети, устройства, подписки и токены. Действие необратимо.

В интерфейсе:
1. Кнопка «Удалить аккаунт» в профиле или настройках, её должно быть легко найти.
2. Окно подтверждения.
3. После ответа `200` очистите токены в Keychain и откройте экран входа.

## 3. Настройка Xcode и Apple Developer

- В App ID включена capability **Sign In with Apple**.
- В Xcode: Target → Signing & Capabilities → **+ Sign in with Apple**.
- Проверка на **iPad** обязательна: App Review тестирует на iPad Air.

## 4. Оплата

Если в приложении продаётся цифровой контент (подписка), на iOS используется только In-App Purchase. Кнопки и ссылки Click/Payme на iOS должны быть скрыты.

## Настройка сервера

```
APPLE_CLIENT_IDS=<Bundle ID приложения>
APPLE_TEAM_ID=<Team ID>
APPLE_KEY_ID=<Key ID ключа Sign in with Apple>
APPLE_PRIVATE_KEY_PATH=/путь/к/AuthKey_XXXXXXXXXX.p8
```

После деплоя: `npm run db:migrate` (миграция `014_users_apple_tokens.sql`), затем перезапуск сервера.

Если вход через Apple возвращает `401`, ищите в логах сервера строку `apple identity token rejected`: поле `claim: "aud"` значит, что Bundle ID не указан в `APPLE_CLIENT_IDS`.
