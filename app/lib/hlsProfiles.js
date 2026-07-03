export const hlsRenditionProfiles = [
  {
    quality: "360",
    label: "360p",
    directory: "360p",
    width: 640,
    height: 360,
    videoBitrate: 800000,
    maxrate: 856000,
    bufsize: 1200000,
    audioBitrate: 96000,
    bandwidth: 1000000,
    averageBandwidth: 700000
  },
  {
    quality: "480",
    label: "480p",
    directory: "480p",
    width: 854,
    height: 480,
    videoBitrate: 1400000,
    maxrate: 1498000,
    bufsize: 2100000,
    audioBitrate: 128000,
    bandwidth: 1700000,
    averageBandwidth: 1200000
  },
  {
    quality: "720",
    label: "720p",
    directory: "720p",
    width: 1280,
    height: 720,
    videoBitrate: 2800000,
    maxrate: 2996000,
    bufsize: 4200000,
    audioBitrate: 128000,
    bandwidth: 3300000,
    averageBandwidth: 2400000
  },
  {
    quality: "1080",
    label: "1080p",
    directory: "1080p",
    width: 1920,
    height: 1080,
    videoBitrate: 5000000,
    maxrate: 5350000,
    bufsize: 7500000,
    audioBitrate: 192000,
    bandwidth: 5800000,
    averageBandwidth: 4300000
  }
];

export function buildHlsMasterPlaylist(renditions) {
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-INDEPENDENT-SEGMENTS"
  ];

  for (const rendition of renditions) {
    const attributes = [
      `BANDWIDTH=${rendition.bandwidth}`,
      `AVERAGE-BANDWIDTH=${rendition.averageBandwidth}`,
      `RESOLUTION=${rendition.width}x${rendition.height}`,
      `NAME="${rendition.label}"`
    ];

    lines.push(`#EXT-X-STREAM-INF:${attributes.join(",")}`);
    lines.push(rendition.playlistFile);
  }

  return `${lines.join("\n")}\n`;
}

// H.264 codec strings advertised per resolution in #EXT-X-STREAM-INF.
const avcCodecByHeight = {
  360: "avc1.4d401e",
  480: "avc1.4d401e",
  720: "avc1.64001f",
  1080: "avc1.640028"
};

export function avcCodecForHeight(height) {
  return avcCodecByHeight[height] || "avc1.4d401e";
}

function quoteAttr(value) {
  return `"${String(value ?? "").replace(/"/g, "")}"`;
}

function pickDefaultTrack(tracks, defaultLanguage) {
  const explicit = tracks.find((track) => track.isDefault);
  if (explicit) {
    return explicit;
  }

  const byLanguage = tracks.find((track) => track.languageCode === defaultLanguage);
  if (byLanguage) {
    return byLanguage;
  }

  return tracks[0] || null;
}

/**
 * Build a multi-audio HLS master playlist.
 *
 * @param {object} input
 * @param {Array<{label:string,width:number,height:number,bandwidth:number,averageBandwidth:number,playlistFile:string}>} input.renditions
 * @param {Array<{languageCode:string,label:string,uri:string,isDefault?:boolean}>} [input.audioTracks]
 * @param {Array<{languageCode:string,label:string,uri:string,isDefault?:boolean}>} [input.subtitles]
 * @param {string} [input.defaultAudioLanguage]
 * @returns {string}
 */
export function buildMultiAudioMasterPlaylist({
  renditions = [],
  audioTracks = [],
  subtitles = [],
  defaultAudioLanguage = ""
} = {}) {
  const audioGroupId = "audio";
  const subtitleGroupId = "subs";
  const hasAudioGroup = audioTracks.length > 0;
  const subtitleTracks = subtitles.filter((track) => track.uri && track.uri.endsWith(".m3u8"));
  const hasSubtitleGroup = subtitleTracks.length > 0;

  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    "#EXT-X-INDEPENDENT-SEGMENTS"
  ];

  if (hasAudioGroup) {
    const defaultTrack = pickDefaultTrack(audioTracks, defaultAudioLanguage);

    for (const track of audioTracks) {
      const isDefault = track === defaultTrack;
      lines.push(
        "#EXT-X-MEDIA:" + [
          "TYPE=AUDIO",
          `GROUP-ID=${quoteAttr(audioGroupId)}`,
          `NAME=${quoteAttr(track.label)}`,
          `DEFAULT=${isDefault ? "YES" : "NO"}`,
          "AUTOSELECT=YES",
          `LANGUAGE=${quoteAttr(track.languageCode)}`,
          `URI=${quoteAttr(track.uri)}`
        ].join(",")
      );
    }
  }

  if (hasSubtitleGroup) {
    const defaultSubtitle = pickDefaultTrack(subtitleTracks, defaultAudioLanguage);

    for (const track of subtitleTracks) {
      const isDefault = track === defaultSubtitle;
      lines.push(
        "#EXT-X-MEDIA:" + [
          "TYPE=SUBTITLES",
          `GROUP-ID=${quoteAttr(subtitleGroupId)}`,
          `NAME=${quoteAttr(track.label)}`,
          `DEFAULT=${isDefault ? "YES" : "NO"}`,
          "AUTOSELECT=YES",
          "FORCED=NO",
          `LANGUAGE=${quoteAttr(track.languageCode)}`,
          `URI=${quoteAttr(track.uri)}`
        ].join(",")
      );
    }
  }

  for (const rendition of renditions) {
    const codecs = hasAudioGroup
      ? `${avcCodecForHeight(rendition.height)},mp4a.40.2`
      : avcCodecForHeight(rendition.height);
    const attributes = [
      `BANDWIDTH=${rendition.bandwidth}`,
      `AVERAGE-BANDWIDTH=${rendition.averageBandwidth}`,
      `RESOLUTION=${rendition.width}x${rendition.height}`,
      `CODECS=${quoteAttr(codecs)}`,
      `NAME=${quoteAttr(rendition.label)}`
    ];

    if (hasAudioGroup) {
      attributes.push(`AUDIO=${quoteAttr(audioGroupId)}`);
    }

    if (hasSubtitleGroup) {
      attributes.push(`SUBTITLES=${quoteAttr(subtitleGroupId)}`);
    }

    lines.push(`#EXT-X-STREAM-INF:${attributes.join(",")}`);
    lines.push(rendition.playlistFile);
  }

  return `${lines.join("\n")}\n`;
}
