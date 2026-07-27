// Rebuilds the multi-audio HLS master playlist from state that is already
// persisted, without re-encoding anything. The rendition ladder lives on
// movie_assets.renditions and the per-rendition playlists stay on disk, so
// detaching an audio track only needs the manifest rewritten.

import { buildMultiAudioMasterPlaylist, hlsRenditionProfiles } from "./hlsProfiles.js";

const profilesByLabel = new Map(hlsRenditionProfiles.map((profile) => [profile.label, profile]));

function renditionLabel(rendition) {
  if (rendition?.label) {
    return String(rendition.label);
  }

  return rendition?.quality ? `${rendition.quality}p` : "";
}

// The column is jsonb, but tolerate a raw string in case a caller hands over an
// unparsed row.
function parseRenditions(renditions) {
  if (typeof renditions === "string") {
    try {
      return JSON.parse(renditions);
    } catch {
      return [];
    }
  }

  return Array.isArray(renditions) ? renditions : [];
}

// Only bandwidth/width/height are persisted per rendition; AVERAGE-BANDWIDTH and
// any missing geometry come back from the profile table by label.
function renditionEntry(rendition) {
  const label = renditionLabel(rendition);
  const profile = profilesByLabel.get(label) || null;
  const bandwidth = Number(rendition.bandwidth) || profile?.bandwidth || 0;
  const averageBandwidth = Number(rendition.averageBandwidth ?? rendition.average_bandwidth)
    || profile?.averageBandwidth
    || bandwidth;

  return {
    label,
    width: Number(rendition.width) || profile?.width || 0,
    height: Number(rendition.height) || profile?.height || 0,
    bandwidth,
    averageBandwidth,
    // Mirrors the layout runProcessing() writes: hls/video/<label>.m3u8.
    playlistFile: `video/${label}.m3u8`
  };
}

export function audioTrackEntry(track) {
  return {
    languageCode: track.language_code,
    label: track.label || track.language_code,
    isDefault: Boolean(track.is_default),
    uri: `audio/${track.language_code}/index.m3u8`
  };
}

// Returns null when there is no rendered ladder to point at — the next
// processing run writes the master playlist from scratch.
export function buildMasterPlaylistFromState({
  renditions = [],
  audioTracks = [],
  defaultAudioLanguage = ""
} = {}) {
  const entries = parseRenditions(renditions)
    .map(renditionEntry)
    .filter((entry) => entry.label && entry.height);

  if (entries.length === 0) {
    return null;
  }

  return buildMultiAudioMasterPlaylist({
    renditions: entries,
    audioTracks: audioTracks.map(audioTrackEntry),
    subtitles: [],
    defaultAudioLanguage: defaultAudioLanguage || ""
  });
}
