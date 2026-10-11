import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { createSecureMedia, isProtectedMediaPath } from "../app/lib/secureMedia.js";

// A tiny HLS stream: 5 segments × 6 s.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "astir-media-"));
const stream = path.join(root, "hls", "m1", "720p");
fs.mkdirSync(stream, { recursive: true });
fs.writeFileSync(path.join(root, "hls", "m1", "master.m3u8"), "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n720p/index.m3u8\n");
const segments = [0, 1, 2, 3, 4].map((index) => `seg_${index}.ts`);
fs.writeFileSync(
  path.join(stream, "index.m3u8"),
  ["#EXTM3U", "#EXT-X-TARGETDURATION:6", ...segments.flatMap((name) => ["#EXTINF:6.0,", name]), "#EXT-X-ENDLIST", ""].join("\n")
);
for (const name of segments) fs.writeFileSync(path.join(stream, name), name);
fs.mkdirSync(path.join(root, "uploads"));
fs.writeFileSync(path.join(root, "uploads", "poster.webp"), "img");

let clock = Date.now();
const media = createSecureMedia({ secret: "test-secret", mediaRoot: root, now: () => clock });
const app = express();
app.use(media.signJsonResponses);
app.get("/movie", (request, response) => response.json({
  id: "m1",
  poster: "/media/uploads/poster.webp",
  subscription_required: request.query.locked === "1",
  playback: { hls_url: "/media/hls/m1/master.m3u8" }
}));
app.use("/media", media.handler, media.guard, express.static(root));
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const get = (url) => fetch(`${base}${url}`);

try {
  assert.ok(isProtectedMediaPath("hls/m1/master.m3u8"));
  assert.ok(isProtectedMediaPath("uploads/clip.mp4"));
  assert.ok(!isProtectedMediaPath("uploads/poster.webp"));

  // Open links to video are refused, images stay public.
  assert.equal((await get("/media/hls/m1/master.m3u8")).status, 403);
  assert.equal((await get("/media/uploads/poster.webp")).status, 200);

  // Full access: the signed master, its playlist and every segment load.
  const full = await (await get("/movie")).json();
  assert.equal(full.poster, "/media/uploads/poster.webp", "images are not rewritten");
  const fullUrl = full.playback.hls_url;
  assert.match(fullUrl, /^\/media\/s\/\d+\.full\.[\w-]+\/hls\/m1\/master\.m3u8$/);
  const fullBase = fullUrl.replace("master.m3u8", "");
  assert.equal((await get(fullUrl)).status, 200);
  assert.match(await (await get(`${fullBase}720p/index.m3u8`)).text(), /seg_4\.ts/);
  assert.equal((await get(`${fullBase}720p/seg_4.ts`)).status, 200);

  // Preview: the playlist stops after 15 s and later segments are refused.
  const locked = await (await get("/movie?locked=1")).json();
  const previewBase = locked.playback.hls_url.replace("master.m3u8", "");
  assert.match(previewBase, /\.preview\./);
  const playlist = await (await get(`${previewBase}720p/index.m3u8`)).text();
  assert.match(playlist, /seg_2\.ts/);
  assert.doesNotMatch(playlist, /seg_3\.ts/);
  assert.match(playlist, /#EXT-X-ENDLIST/);
  assert.equal((await get(`${previewBase}720p/seg_2.ts`)).status, 200);
  assert.equal((await get(`${previewBase}720p/seg_3.ts`)).status, 403);

  // Tampering and expiry.
  assert.equal((await get(fullUrl.replace(".full.", ".preview."))).status, 403);
  assert.equal((await get(fullUrl.replace("/hls/m1/", "/hls/m2/"))).status, 403);
  // An encoded ../ that survives URL normalisation still cannot leave the media root.
  assert.equal((await get(`${fullBase}%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd`)).status, 404);
  clock += 13 * 60 * 60 * 1000;
  const expired = await get(fullUrl);
  assert.equal(expired.status, 403);
  assert.equal((await expired.json()).code, "media_url_expired");

  console.log("secure media tests passed");
} finally {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
}
