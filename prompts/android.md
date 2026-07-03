# Android / Android TV — Multi-Audio HLS Playback (Claude Code prompt)

You are working on the **Astir** Android app (phone + Android TV). The backend now serves
real **multi-audio HLS**: one video stream with alternate audio tracks (Uzbek / Russian /
English) and optional WebVTT subtitles. Implement playback and language switching against
that contract. Do **not** download per-language duplicate videos and do **not** use YouTube.

## Backend contract

Movie detail: `GET /api/v1/content/:id` (bearer auth) returns, in addition to existing fields:

```json
{
  "id": "…",
  "title": { "uz": "…", "ru": "…", "en": "…" },
  "hlsUrl": "https://api.astir.uz/media/legacy/streaming/<id>/hls/master.m3u8",
  "streamingStatus": "ready",              // uploaded | processing | ready | failed
  "defaultAudioLanguage": "uz",
  "audioTracks": [
    { "languageCode": "uz", "label": "Uzbek",   "isDefault": true,  "url": "https://…/audio/uz/index.m3u8" },
    { "languageCode": "ru", "label": "Russian", "isDefault": false, "url": "https://…/audio/ru/index.m3u8" },
    { "languageCode": "en", "label": "English", "isDefault": false, "url": "https://…/audio/en/index.m3u8" }
  ],
  "subtitles": [
    { "languageCode": "uz", "label": "Uzbek", "url": "https://…/subtitles/uz.vtt" }
  ]
}
```

- The `master.m3u8` already contains the alternate audio group
  (`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="uz|ru|en"`), so the player exposes
  the audio tracks natively — you do **not** need the `audioTracks[].url` values to play;
  they are informational. Use `audioTracks` for building the UI selector and labels.
- Only treat a movie as playable when `streamingStatus === "ready"`. For `processing`,
  show a "still processing" state; for `failed`, show an error.

## Tasks

1. **Playback (Media3 / ExoPlayer).**
   - Add/confirm Media3 (`androidx.media3:media3-exoplayer`, `-exoplayer-hls`, `-ui`).
   - Build the player with an `HlsMediaSource` (or `MediaItem` + default HLS support) from `hlsUrl`.
   - Verify HLS with alternate audio renditions plays and adaptive bitrate works (480/720/1080).

2. **Preferred audio language.**
   - Resolve preferred language: `prefs.getString("astir_preferred_audio_language", null) ?: movie.defaultAudioLanguage`.
   - Apply before/at prepare:
     ```kotlin
     player.trackSelectionParameters = player.trackSelectionParameters
       .buildUpon()
       .setPreferredAudioLanguage(preferredLanguage)   // "uz" | "ru" | "en"
       .build()
     ```
   - On the next video, auto-select the same language if present.

3. **In-player language selector (phone + TV).**
   - Show an audio-language control only when `audioTracks.length > 1`.
   - Populate it from the player's audio `Tracks` (or fall back to `movie.audioTracks`).
   - On selection: override the track group for `C.TRACK_TYPE_AUDIO` (or set
     `setPreferredAudioLanguage(lang)` and reselect), then persist:
     `prefs.edit().putString("astir_preferred_audio_language", lang).apply()`.
   - On Android TV, make the control D-pad focusable and reachable from the transport controls.

4. **Subtitles.**
   - For each entry in `subtitles`, add a side-loaded `SubtitleConfiguration`
     (`MimeTypes.TEXT_VTT`, `language = languageCode`) to the `MediaItem`.
   - Provide a subtitle on/off + language toggle in the player UI.

5. **State handling.**
   - Guard playback entry on `streamingStatus`. Poll or refresh detail for `processing`.
   - Surface `processingError` text if `failed` (admin/debug builds).

## Acceptance criteria

- A single movie plays one video with switchable Uzbek/Russian/English audio (no reload/seek reset on switch).
- Preferred language is remembered across movies via `astir_preferred_audio_language`.
- Selector appears only when more than one audio track exists; works with touch and D-pad.
- Subtitles can be enabled/switched when present.
- Movies not yet `ready` do not enter the player.
- Existing screens/APIs are untouched; this is additive to the player layer.

## Notes

- Keep the language codes exactly `uz` / `ru` / `en` to match the manifest `LANGUAGE` tags.
- Test on both a phone and an Android TV emulator/device (focus + remote navigation).
- Do not hardcode `api.astir.uz`; use the app's configured base URL. HLS is currently served
  unsigned over the media path — no per-segment token handling is required yet.
