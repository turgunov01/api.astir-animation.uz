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
