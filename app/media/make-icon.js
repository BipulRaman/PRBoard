// One-off generator for media/icon.png (128x128 marketplace icon).
// Run: node media/make-icon.js
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const S = 128;
const data = Buffer.alloc(S * S * 4);

function set(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  // simple source-over alpha blend onto existing pixel
  const sa = a / 255;
  const da = data[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  data[i] = Math.round((r * sa + data[i] * da * (1 - sa)) / oa);
  data[i + 1] = Math.round((g * sa + data[i + 1] * da * (1 - sa)) / oa);
  data[i + 2] = Math.round((b * sa + data[i + 2] * da * (1 - sa)) / oa);
  data[i + 3] = Math.round(oa * 255);
}

function inRoundedRect(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || y < y0 || x > x1 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}

// Background: rounded square with vertical gradient (GitHub-ish blue/purple).
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (!inRoundedRect(x, y, 6, 6, S - 6, S - 6, 26)) continue;
    const t = y / S;
    const r = Math.round(45 + t * 40);
    const g = Math.round(120 + t * 20);
    const b = Math.round(235 - t * 60);
    set(x, y, r, g, b, 255);
  }
}

// White glyph: two checklist lines + a checkmark (mirrors media/icon.svg).
function rect(x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, 255, 255, 255, 255);
}
function disc(cx, cy, rad) {
  for (let y = cy - rad; y <= cy + rad; y++)
    for (let x = cx - rad; x <= cx + rad; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) set(x, y, 255, 255, 255, 255);
    }
}
function line(x0, y0, x1, y1, w) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps);
    const y = Math.round(y0 + ((y1 - y0) * s) / steps);
    disc(x, y, w);
  }
}

// Top list line
rect(34, 40, 94, 48);
// Second (shorter) list line
rect(34, 58, 74, 66);
// Checkmark
line(40, 86, 56, 100, 4);
line(56, 100, 92, 70, 4);

// Encode PNG.
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, body])), 0);
  return Buffer.concat([len, t, body, crc]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  data.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const idat = zlib.deflateSync(raw, { level: 9 });
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.writeFileSync(path.join(__dirname, "icon.png"), png);
console.log("Wrote media/icon.png", png.length, "bytes");
