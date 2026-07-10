# Multi-Audio HLS Streaming

Real HLS streaming with a single video and multiple **alternate audio tracks**
(Uzbek / Russian / English) plus optional WebVTT subtitles — no duplicate per-language
videos, no YouTube. Built on the existing Postgres-backed **legacy** content system
(`content` table; there is no `movies` table on this platform).

The player receives one `master.m3u8` whose variants share an audio group
(`#EXT-X-MEDIA:TYPE=AUDIO`), so switching language does not reload the video.

---

## 1. Files changed

| File | Change |
|------|--------|
| `migrations/012_streaming_multi_audio.sql` | **New.** `movie_assets`, `movie_audio_tracks`, `movie_subtitles` (FK → `content(id)`) + triggers |
| `app/lib/hlsProfiles.js` | **Added** `buildMultiAudioMasterPlaylist()` and `avcCodecForHeight()`. Existing `buildHlsMasterPlaylist` untouched |
| `app/legacy/streaming.js` | **New.** Upload middleware, DB upserts, FFprobe validation, FFmpeg workers, non-blocking job runner, serializers |
| `app/legacy/routes.js` | **Added** 3 admin endpoints; enriched `GET /content/:id`; delete-time cleanup; `streaming` dependency |
| `app/server.js` | Instantiates `createLegacyStreaming` and injects it into `createLegacyRoutes` |
| `scripts/streaming-assets-test.js` | **New.** Unit smoke test (no DB/FFmpeg needed) |

Existing behavior preserved: `POST /content/:id/upload` (single muxed transcode),
`renditions`/`transcoding_jobs`, and all content/category/subscription APIs are unchanged.

## 2. New environment variables

**None required.** The feature reuses existing config:

- `MEDIA_ROOT` (default `media`) — HLS output lives under `<MEDIA_ROOT>/legacy/streaming/<contentId>/`.
- `FFMPEG_PATH` / `FFPROBE_PATH` (default `ffmpeg` / `ffprobe`) — must be installed on the host.
- `MAX_VIDEO_UPLOAD_MB` (default `8192`) — per-file upload cap in MB. The nginx `client_max_body_size` on the reverse proxy caps the whole multipart body (video + all audio tracks + subtitles combined) and must be `>=` this value, or oversized uploads are rejected with a `413` that surfaces in the browser as a misleading CORS error.
- `TRANSCODER_ENABLED` (default `true`) — when `false`, processing is marked `failed` with reason `transcoder disabled`.

## 3. DB migration

`migrations/012_streaming_multi_audio.sql` adds:

- **`movie_assets`** — one row per content: `content_id`, `source_video_path`,
  `hls_master_path`, `hls_master_url`, `status` (`uploaded|processing|ready|failed`),
  `processing_error`, `duration_seconds`, `default_audio_language`. Unique on `content_id`.
- **`movie_audio_tracks`** — `content_id`, `language_code`, `label`, `source_audio_path`,
  `hls_playlist_path`, `hls_playlist_url`, `is_default`. Unique on `(content_id, language_code)`.
- **`movie_subtitles`** — `content_id`, `language_code`, `label`, `file_path`, `file_url`.
  Unique on `(content_id, language_code)`.

## 4. Run the migration

```bash
npm run db:migrate
```

Idempotent and transactional; it auto-applies any un-applied `migrations/*.sql` in order
and records them in `schema_migrations`.

## 5. API

All admin endpoints require an **admin/super_admin** bearer token (`requireAdmin`).

### `POST /api/v1/content/:id/streaming-assets` — upload & start processing
`multipart/form-data` fields (all optional except a video on first upload):

| Field | Type | Notes |
|-------|------|-------|
| `video` | mp4 / mov / mkv | main video (required on first upload) |
| `audio_uz`, `audio_ru`, `audio_en` | mp3 / wav / m4a / aac | per-language audio |
| `subtitle_uz`, `subtitle_ru`, `subtitle_en` | vtt | per-language subtitles |
| `defaultAudioLanguage` | string | `uz` \| `ru` \| `en` |

Saves files, upserts rows, sets status `processing`, and returns **`202`** immediately
(FFmpeg runs in the background). Re-posting replaces sources and re-processes.

### `GET /api/v1/content/:id/streaming-assets` — status
Returns `streamingStatus`, `hlsUrl`, `defaultAudioLanguage`, `audioTracks[]`,
`subtitles[]`, and `processingError` (when `failed`).

### `POST /api/v1/content/:id/streaming-assets/reprocess`
Re-runs processing from the stored source files.

### Public: `GET /api/v1/content/:id` (existing endpoint, extended)
Now also includes:

```json
{
  "id": "…",
  "title": { "uz": "…", "ru": "…", "en": "…" },
  "hlsUrl": "https://api.astir.uz/media/legacy/streaming/<id>/hls/master.m3u8",
  "streamingStatus": "ready",
  "defaultAudioLanguage": "uz",
  "audioTracks": [
    { "languageCode": "uz", "label": "Uzbek", "isDefault": true,  "url": "https://…/audio/uz/index.m3u8" },
    { "languageCode": "ru", "label": "Russian", "isDefault": false, "url": "https://…/audio/ru/index.m3u8" },
    { "languageCode": "en", "label": "English", "isDefault": false, "url": "https://…/audio/en/index.m3u8" }
  ],
  "subtitles": [
    { "languageCode": "uz", "label": "Uzbek", "url": "https://…/subtitles/uz.vtt" }
  ]
}
```

> The client should treat the movie as playable only when `streamingStatus === "ready"`.

## 6. Storage layout

```
media/legacy/streaming/<contentId>/
  source/   video.mp4  audio_uz.mp3  audio_ru.mp3  audio_en.mp3  subtitle_uz.vtt …
  hls/
    master.m3u8
    video/    480p.m3u8 480p_000.ts  720p.m3u8 …  1080p.m3u8 …
    audio/    uz/index.m3u8 uz/seg_000.ts   ru/…   en/…
    subtitles/ uz.vtt ru.vtt en.vtt
```

Served statically at `/media/legacy/streaming/<id>/hls/master.m3u8` (child playlists and
segments are referenced by relative URIs inside the master).

## 7. How to test the upload

Unit smoke test (no DB / FFmpeg needed):

```bash
node scripts/streaming-assets-test.js
```

End-to-end (needs Postgres, FFmpeg, an admin token, and an existing content row):

```bash
# 1. Run migrations
npm run db:migrate

# 2. Start the API
npm run dev

# 3. Upload a video + three audio tracks + one subtitle
curl -X POST "http://127.0.0.1:2048/api/v1/content/$CONTENT_ID/streaming-assets" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "video=@./sample/movie.mp4" \
  -F "audio_uz=@./sample/uz.mp3" \
  -F "audio_ru=@./sample/ru.mp3" \
  -F "audio_en=@./sample/en.mp3" \
  -F "subtitle_uz=@./sample/uz.vtt" \
  -F "defaultAudioLanguage=uz"
# -> 202 with streamingStatus:"processing"

# 4. Poll status until ready|failed
curl "http://127.0.0.1:2048/api/v1/content/$CONTENT_ID/streaming-assets" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 5. Reprocess if needed
curl -X POST "http://127.0.0.1:2048/api/v1/content/$CONTENT_ID/streaming-assets/reprocess" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 8. Verify the generated HLS

```bash
# Master should list EXT-X-MEDIA audio tracks and AUDIO="audio" on each variant
curl -s "http://127.0.0.1:2048/media/legacy/streaming/$CONTENT_ID/hls/master.m3u8"

# ffprobe sees multiple audio programs / a video + audio group
ffprobe -v error -show_streams \
  "http://127.0.0.1:2048/media/legacy/streaming/$CONTENT_ID/hls/master.m3u8"

# Play with audio switching
ffplay "http://127.0.0.1:2048/media/legacy/streaming/$CONTENT_ID/hls/master.m3u8"
```

## 9. Duration validation

Before transcoding, each audio track's duration is compared to the video's.
If any track drifts more than **1.5 s**, processing fails with e.g.:

```
audio track "ru" duration (5398.20s) does not match video (5400.00s); drift 1.80s exceeds 1.5s tolerance
```

The message is stored in `movie_assets.processing_error` and surfaced via
`GET …/streaming-assets` and the content detail endpoint.

---

## 10. Frontend integration (not in this repo)

The Nuxt admin panel and Web/Android/TV players live in **separate repositories**, so this
section is the contract they should implement against.

### Nuxt 3 admin — "Streaming assets" section (movie edit page)

Add a section titled **Streaming assets** with:

- File inputs: main **video**, **Uzbek/Russian/English audio**, **Uzbek/Russian/English subtitle** (`.vtt`).
- **Default audio language** select: Uzbek / Russian / English.
- Status badge from `GET …/streaming-assets`: `uploaded | processing | ready | failed`
  (poll every ~5 s while `processing`); when `failed`, show `processingError`.
- Buttons: **Upload / Replace streaming assets** → `POST …/streaming-assets` (multipart);
  **Reprocess** → `POST …/streaming-assets/reprocess`.

Submit as `multipart/form-data` with the exact field names above. Do not alter the existing
movie form fields — this is an additive section.

### Web player (hls.js)

```ts
import Hls from "hls.js";

const preferredLanguage =
  localStorage.getItem("astir_preferred_audio_language") || movie.defaultAudioLanguage;

const hls = new Hls();
hls.loadSource(movie.hlsUrl);
hls.attachMedia(videoEl);

hls.on(Hls.Events.MANIFEST_PARSED, () => {
  const index = hls.audioTracks.findIndex((t) => t.lang === preferredLanguage);
  if (index !== -1) hls.audioTrack = index;
});

// When the user picks a language in the UI (show the selector if audioTracks.length > 1):
function setAudioLanguage(lang: string) {
  const index = hls.audioTracks.findIndex((t) => t.lang === lang);
  if (index !== -1) {
    hls.audioTrack = index;
    localStorage.setItem("astir_preferred_audio_language", lang);
  }
}
```

Subtitles are exposed as plain `.vtt` URLs in `subtitles[]`; attach them as
`<track kind="subtitles" srclang="…" src="…">`.

### Android / Android TV (Media3 / ExoPlayer)

```kotlin
player.trackSelectionParameters =
  player.trackSelectionParameters
    .buildUpon()
    .setPreferredAudioLanguage(preferredLanguage) // e.g. "uz", from app prefs or movie.defaultAudioLanguage
    .build()
```

Persist the chosen language in app preferences and reapply on the next video. Populate the
in-player language selector from the manifest's audio groups (or the API `audioTracks`).

---

## 11. Limitations / notes

- **Video is re-encoded** for the multi-audio ladder (audio-stripped renditions).
  The existing `POST /content/:id/upload` muxed path is separate and untouched; a given
  content item should use one path or the other.
- Rendition ladder is 480p/720p/1080p, capped at the source height (never upscales beyond it).
- **Public HLS is served unsigned** via the static `/media` mount (matches the current
  media handling). Signed delivery / CDN is a follow-up. See `security/findings.md` #4.
- Global upload size cap applies to every field (video-sized); per-field caps are a TODO.
- Internal in-process worker (non-blocking `setImmediate`, cancellable). No Redis/BullMQ
  exists in the repo; if one is later added, `startProcessing` is the single integration point.
- Concurrency: jobs are keyed per content id; a new upload/reprocess cancels the running job
  for that id. There is no global concurrency limit across different content ids yet.
```
