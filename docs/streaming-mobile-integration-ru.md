# Astir — Инструкция для мобильного разработчика: видео и мульти-аудио стриминг

Документ описывает **контракт клиента**: какие эндпоинты дёргать, что приходит в ответе,
как проигрывать видео и переключать аудиодорожки по языкам (uz / ru / en) и субтитры.

> Загрузку контента делает **админ-панель** (нужен admin-токен). Мобильному приложению
> загрузка не нужна — только **чтение и воспроизведение**. Раздел про загрузку добавлен
> в конце как справка.

---

## 0. Базовый URL и авторизация

- Base URL (тест): `https://test-api.astir-animation.uz`
- Все запросы — с заголовком `Authorization: Bearer <token>` (обычный пользовательский/девайс-токен).
- Локализация строк: заголовок `Accept-Language: uz | ru | en` (или `?lang=uz`).

---

## 1. Главный эндпоинт для приложения

### `GET /v1/content/{id}`

Один запрос отдаёт и метаданные, и всё для стриминга. Именно его использует приложение
для экрана фильма и для запуска плеера.

**Пример ответа (важные для видео поля):**

```json
{
  "id": "46bdd6c3-61cd-40d9-bb69-f0cf9b0ac889",
  "title": { "uz": "…", "ru": "…", "en": "…" },
  "poster_url": "/media/uploads/…png",

  "streamingStatus": "ready",
  "hlsUrl": "https://test-api.astir-animation.uz/media/legacy/streaming/<id>/hls/master.m3u8",
  "defaultAudioLanguage": "uz",

  "audioTracks": [
    { "languageCode": "uz", "label": "Uzbek",   "isDefault": true,  "url": "https://…/audio/uz/index.m3u8" },
    { "languageCode": "ru", "label": "Russian", "isDefault": false, "url": "https://…/audio/ru/index.m3u8" },
    { "languageCode": "en", "label": "English", "isDefault": false, "url": "https://…/audio/en/index.m3u8" }
  ],

  "subtitles": [
    { "languageCode": "ru", "label": "Russian", "url": "https://…/subtitles/ru.vtt" }
  ]
}
```

### Что означают поля стриминга

| Поле | Тип | Как использовать |
|------|-----|------------------|
| `streamingStatus` | `uploaded` \| `processing` \| `ready` \| `failed` \| `null` | **Играть можно только при `"ready"`.** |
| `hlsUrl` | string \| null | URL HLS-мастера (`master.m3u8`). Передавать в плеер как есть. |
| `defaultAudioLanguage` | `"uz"`\|`"ru"`\|`"en"`\|null | Язык по умолчанию, если у юзера нет сохранённого выбора. |
| `audioTracks[]` | массив | Список доступных аудиодорожек для UI-селектора языка. |
| `subtitles[]` | массив | Отдельные `.vtt`-файлы (см. §4 — в HLS-манифест они **не** вшиты). |

> `audioTracks[].url` и `subtitles[].url` — это прямые ссылки. Для переключения аудио
> **не нужно** грузить их вручную: они уже внутри `master.m3u8` как альтернативные дорожки.
> Массив нужен в основном для отрисовки списка языков в UI.

---

## 2. Логика экрана (обязательная)

```
GET /v1/content/{id}
 ├─ streamingStatus == "ready" && hlsUrl != null
 │     → показать кнопку Play, играть hlsUrl
 ├─ streamingStatus == "processing" | "uploaded"
 │     → показать постер + «Видео обрабатывается», без кнопки Play
 │       (можно перезапросить через 5–10 сек)
 ├─ streamingStatus == "failed"
 │     → «Видео недоступно» (плеер не открывать)
 └─ streamingStatus == null | hlsUrl == null
       → у этого контента ещё нет стриминга (только постер/метаданные)
```

Плеер запускается **строго** по `hlsUrl`. Не собирать URL вручную из `audioTracks`.

---

## 3. Как устроен HLS (важно для звука)

- В `master.m3u8` **видеорендиции идут без встроенного звука** (480p/720p/1080p, видео-only).
- Звук — это **внешняя аудио-группа** (`#EXT-X-MEDIA:TYPE=AUDIO`), по одной дорожке на язык,
  дорожка `defaultAudioLanguage` помечена `DEFAULT=YES`.
- Любой стандартный HLS-плеер (AVPlayer, ExoPlayer/Media3) **сам подхватывает** дорожку
  по умолчанию — звук будет. Переключение языка не перезагружает видео.

⚠️ Если использовать нестандартный/кастомный плеер, который игнорирует альтернативные
аудио-группы, **звука не будет вообще**. Нужен плеер с поддержкой HLS alternate audio
(нативные AVPlayer / ExoPlayer это умеют из коробки).

---

## 4. Субтитры — читать внимательно

Субтитры **не встроены** в HLS-манифест. Они отдаются отдельными `.vtt`-файлами в
`subtitles[].url`. Значит:

- **Android (ExoPlayer/Media3):** подключаются как side-loaded субтитры через
  `MediaItem.SubtitleConfiguration` — работает штатно.
- **iOS (AVPlayer):** AVPlayer сам НЕ умеет side-loaded WebVTT, которых нет в HLS-манифесте.
  Варианты: рендерить `.vtt` своим оверлеем, либо (лучше) попросить бэкенд вшить субтитры
  в манифест. Пока субтитры на iOS — задача клиента.
- Если субтитры не в приоритете для MVP — их можно не показывать; на воспроизведение
  видео и переключение аудио они не влияют.

---

## 5. Плееры — примеры

Сохраняй выбранный язык аудио в настройках приложения и применяй на следующем видео.
Приоритет выбора языка: **сохранённый выбор юзера → `defaultAudioLanguage` → первая дорожка**.

### iOS — AVPlayer (AVFoundation)

```swift
let player = AVPlayer(url: URL(string: movie.hlsUrl)!)

// Выбрать язык аудио
if let item = player.currentItem,
   let group = item.asset.mediaSelectionGroup(forMediaCharacteristic: .audible) {
    let preferred = UserDefaults.standard.string(forKey: "audio_lang") ?? movie.defaultAudioLanguage
    if let option = group.options.first(where: {
        $0.locale?.languageCode == preferred
    }) {
        item.select(option, in: group)
    }
}
```

Список языков для UI берётся из `AVMediaSelectionGroup(.audible).options`
или из `movie.audioTracks`.

### Android / Android TV — Media3 (ExoPlayer)

```kotlin
val preferred = prefs.getString("audio_lang", null) ?: movie.defaultAudioLanguage

// Side-loaded субтитры (потому что их нет в HLS-манифесте)
val subtitleConfigs = movie.subtitles.map { s ->
    MediaItem.SubtitleConfiguration.Builder(Uri.parse(s.url))
        .setMimeType(MimeTypes.TEXT_VTT)
        .setLanguage(s.languageCode)
        .build()
}

val mediaItem = MediaItem.Builder()
    .setUri(movie.hlsUrl)
    .setSubtitleConfigurations(subtitleConfigs)
    .build()

player.setMediaItem(mediaItem)
player.trackSelectionParameters = player.trackSelectionParameters
    .buildUpon()
    .setPreferredAudioLanguage(preferred)  // "uz" / "ru" / "en"
    .build()
player.prepare()
```

Переключение языка на лету — снова `setPreferredAudioLanguage(...)` и сохранить в prefs.

### Flutter — better_player

```dart
BetterPlayerDataSource(
  BetterPlayerDataSourceType.network,
  movie.hlsUrl,
  subtitles: movie.subtitles
      .map((s) => BetterPlayerSubtitlesSource(
            type: BetterPlayerSubtitlesSourceType.network,
            name: s.label,
            urls: [s.url],
          ))
      .toList(),
);
// Аудиодорожки: controller.betterPlayerAsmsAudioTracks / setAudioTrack(...)
```

---

## 6. Чеклист для мобильного клиента

- [ ] Экран фильма читает `GET /v1/content/{id}` (с `Bearer` и `Accept-Language`).
- [ ] Play доступен только при `streamingStatus == "ready"` и `hlsUrl != null`.
- [ ] `processing`/`uploaded` → постер + «обрабатывается», перезапрос через 5–10 сек.
- [ ] Плеер получает `hlsUrl` (не собирать URL руками).
- [ ] Селектор языка аудио заполняется из `audioTracks[]`, дефолт — `defaultAudioLanguage`.
- [ ] Выбранный язык сохраняется и применяется на следующем видео.
- [ ] Субтитры (если нужны) — side-load из `subtitles[].url` (`.vtt`), учесть нюанс iOS.
- [ ] Плеер — с поддержкой HLS alternate audio (AVPlayer / ExoPlayer), иначе не будет звука.

---

## 7. Частые вопросы / ошибки

| Симптом | Причина | Что делать |
|---------|---------|------------|
| Видео не играет, `streamingStatus` не `ready` | Транскодинг ещё идёт или упал | Ждать `ready`; при `failed` видео не открывать |
| `hlsUrl == null` | У контента нет стрим-ассетов | Показать только постер/метаданные |
| Видео идёт, звука нет | Плеер не выбрал альтернативную аудио-дорожку | Использовать нативный HLS-плеер; явно задать язык аудио |
| Не переключается язык | Пытаетесь грузить `audioTracks[].url` отдельным плеером | Переключать дорожку внутри одного `hlsUrl` (media selection / preferred language) |
| Субтитры не видны на iOS | AVPlayer не поддерживает side-loaded VTT вне манифеста | Свой рендер VTT или вшить субтитры на бэкенде |

---

## 8. Справка: как загружается контент (только для админ-панели)

Мобильному приложению это **не нужно** — приведено для понимания источника данных.
Все три эндпоинта требуют **admin-токен** (`requireAdmin`).

- `POST /v1/content/{id}/streaming-assets` — `multipart/form-data`, поля:
  - `video` (`.mp4/.mov/.mkv`) — основной видеофайл (обязателен при первой загрузке)
  - `audio_uz` / `audio_ru` / `audio_en` (`.mp3/.wav/.m4a/.aac`) — аудио по языкам
  - `subtitle_uz` / `subtitle_ru` / `subtitle_en` (`.vtt`) — субтитры
  - `defaultAudioLanguage` — `uz` | `ru` | `en`
  - Возвращает `202` сразу, FFmpeg обрабатывает в фоне. Повторная загрузка заменяет исходники.
- `GET /v1/content/{id}/streaming-assets` — статус обработки (admin).
- `POST /v1/content/{id}/streaming-assets/reprocess` — перезапуск обработки.

Ограничение синхронизации: длительность каждой аудиодорожки должна совпадать с видео
с допуском **1.5 сек**, иначе обработка завершится статусом `failed` с текстом ошибки
в `processingError`.

> Мобильный клиент видит результат этой обработки через поля `streamingStatus`, `hlsUrl`,
> `audioTracks`, `subtitles` в `GET /v1/content/{id}` (§1).
