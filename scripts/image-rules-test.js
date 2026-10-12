import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { imageProblem, readImageInfo, validateImageUploads } from "../app/lib/imageRules.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astir-image-rules-"));

function write(name, buffer) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, buffer);
  return { path: filePath, size: buffer.length, fieldname: "poster" };
}

function png(width, height) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpeg(width, height) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

function webp(chunk, width, height) {
  const buffer = Buffer.alloc(40);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(32, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write(chunk, 12, "ascii");

  if (chunk === "VP8 ") {
    buffer.writeUInt16LE(width, 26);
    buffer.writeUInt16LE(height, 28);
  } else if (chunk === "VP8L") {
    buffer.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  } else {
    buffer.writeUIntLE(width - 1, 24, 3);
    buffer.writeUIntLE(height - 1, 27, 3);
  }

  return buffer;
}

// Header parsing for every supported format.
assert.deepEqual(readImageInfo(write("a.png", png(1920, 1080)).path), { format: "png", width: 1920, height: 1080 });
assert.deepEqual(readImageInfo(write("a.jpg", jpeg(1280, 720)).path), { format: "jpeg", width: 1280, height: 720 });
assert.deepEqual(readImageInfo(write("a.webp", webp("VP8 ", 1920, 1080)).path), { format: "webp", width: 1920, height: 1080 });
assert.deepEqual(readImageInfo(write("b.webp", webp("VP8L", 512, 512)).path), { format: "webp", width: 512, height: 512 });
assert.deepEqual(readImageInfo(write("c.webp", webp("VP8X", 3840, 2160)).path), { format: "webp", width: 3840, height: 2160 });
assert.equal(readImageInfo(write("a.gif", Buffer.from("GIF89a................")).path), null);

// Banner: 16:9, at least 1280x720, any file size.
assert.equal(imageProblem(write("ok.png", png(1920, 1080)), "banner"), null);
assert.equal(imageProblem(write("ok2.jpg", jpeg(1280, 720)), "banner"), null);
assert.match(imageProblem(write("portrait.png", png(1080, 1350)), "banner"), /пропорции/);
assert.match(imageProblem(write("wide.png", png(1280, 656)), "banner"), /пропорции/);
assert.match(imageProblem(write("small.png", png(960, 540)), "banner"), /маленькое/);
assert.match(imageProblem(write("x.gif", Buffer.from("GIF89a................")), "banner"), /JPG, PNG и WebP/);
assert.equal(imageProblem({ ...write("big.png", png(1920, 1080)), size: 60 * 1024 * 1024 }, "banner"), null, "posters may be any size");

// Category icon: square, at least 256x256, <= 1 MB.
assert.equal(imageProblem(write("icon.webp", webp("VP8L", 512, 512)), "icon"), null);
assert.match(imageProblem(write("photo.jpg", jpeg(1080, 1350)), "icon"), /пропорции/);
assert.match(imageProblem(write("tiny.png", png(128, 128)), "icon"), /маленькое/);

// Middleware rejects the request and deletes every uploaded file.
const bad = { ...write("bad.png", png(1080, 1350)), fieldname: "poster" };
const video = { ...write("video.mp4", Buffer.from("video")), fieldname: "video" };
let error = null;
validateImageUploads({ poster: "banner" })({ files: { poster: [bad], video: [video] } }, {}, (value) => { error = value; });
assert.equal(error.statusCode, 400);
assert.equal(error.code, "IMAGE_INVALID");
assert.equal(fs.existsSync(bad.path), false);
assert.equal(fs.existsSync(video.path), false);

const good = { ...write("good.png", png(1920, 1080)), fieldname: "file" };
let passed = null;
validateImageUploads({ file: "banner" })({ file: good }, {}, (value) => { passed = value ?? "ok"; });
assert.equal(passed, "ok");
assert.equal(fs.existsSync(good.path), true);

fs.rmSync(dir, { recursive: true, force: true });
console.log("Image rules tests passed");
