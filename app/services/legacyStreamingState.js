// Reads multi-audio streaming state (movie_assets / movie_audio_tracks /
// movie_subtitles) from the legacy Postgres database so the primary content
// API (/v1/content/movies/*) can report real HLS playback instead of the
// stale `missing_source` transcode status produced by the JSON/content store.
//
// The streaming upload pipeline (app/legacy/streaming.js) persists results into
// these tables keyed by content id, but contentService reads from a separate
// store. This reader bridges the two contours for read/serialization only.

function normalizeAudioTrack(row) {
  return {
    languageCode: row.language_code,
    label: row.label,
    isDefault: Boolean(row.is_default),
    url: row.hls_playlist_url || null
  };
}

function normalizeSubtitle(row) {
  return {
    languageCode: row.language_code,
    label: row.label,
    url: row.file_url || null
  };
}

function groupByContent(rows, mapper) {
  const byContent = new Map();

  for (const row of rows) {
    const list = byContent.get(row.content_id) || [];
    list.push(mapper(row));
    byContent.set(row.content_id, list);
  }

  return byContent;
}

export function createLegacyStreamingState({ db } = {}) {
  if (!db) {
    return null;
  }

  async function loadForContents(contentIds) {
    const ids = [...new Set((contentIds || []).filter(Boolean))];
    const byId = new Map();

    if (ids.length === 0) {
      return byId;
    }

    let assets = [];

    try {
      assets = await db.many(
        "SELECT * FROM movie_assets WHERE content_id::text = ANY($1)",
        [ids]
      );
    } catch {
      // Streaming tables may not exist yet (migration not applied). Never let
      // the streaming overlay break the primary content response.
      return byId;
    }

    if (assets.length === 0) {
      return byId;
    }

    const assetIds = assets.map((asset) => asset.content_id);
    let trackRows = [];
    let subtitleRows = [];

    try {
      trackRows = await db.many(
        "SELECT * FROM movie_audio_tracks WHERE content_id::text = ANY($1) ORDER BY created_at, language_code",
        [assetIds]
      );
      subtitleRows = await db.many(
        "SELECT * FROM movie_subtitles WHERE content_id::text = ANY($1) ORDER BY language_code",
        [assetIds]
      );
    } catch {
      // Keep going with whatever loaded; tracks/subtitles are optional.
    }

    const tracksByContent = groupByContent(trackRows, normalizeAudioTrack);
    const subtitlesByContent = groupByContent(subtitleRows, normalizeSubtitle);

    for (const asset of assets) {
      const audioTracks = tracksByContent.get(asset.content_id) || [];
      const defaultTrack = audioTracks.find((track) => track.isDefault);

      byId.set(asset.content_id, {
        status: asset.status || null,
        hlsUrl: asset.hls_master_url || null,
        defaultAudioLanguage: asset.default_audio_language || defaultTrack?.languageCode || null,
        durationSeconds: Number(asset.duration_seconds) || null,
        processingError: asset.processing_error || null,
        audioTracks,
        subtitles: subtitlesByContent.get(asset.content_id) || []
      });
    }

    return byId;
  }

  async function loadForContent(contentId) {
    if (!contentId) {
      return null;
    }

    const byId = await loadForContents([contentId]);
    return byId.get(contentId) || null;
  }

  return { loadForContent, loadForContents };
}
