// One-off generator for media/icon.png (128x128 marketplace icon).
// Renders a polished pull-request glyph on a brand-gradient rounded square,
// matching docs/icon.svg. Supersampled 4x for crisp anti-aliasing.
// Run: node media/make-icon.js
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const S = 128; // final size
const SS = 4; // supersample factor
const HR = S * SS; // hi-res render size
const data = Buffer.alloc(HR * HR * 4);

function set(i, r, g, b, a) {
  // source-over alpha blend onto existing pixel (a in 0..1)
  const sa = a;
  const da = data[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  data[i] = Math.round((r * sa + data[i] * da * (1 - sa)) / oa);
  data[i + 1] = Math.round((g * sa + data[i + 1] * da * (1 - sa)) / oa);
  data[i + 2] = Math.round((b * sa + data[i + 2] * da * (1 - sa)) / oa);
  data[i + 3] = Math.round(oa * 255);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function inRoundedRect(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || y < y0 || x > x1 || y > y1) return false;
  const cx = clamp(x, x0 + rad, x1 - rad);
  const cy = clamp(y, y0 + rad, y1 - rad);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function onPolyline(px, py, pts, halfW) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= halfW)
      return true;
  }
  return false;
}
function inAnnulus(px, py, cx, cy, rIn, rOut) {
  const d = Math.hypot(px - cx, py - cy);
  return d >= rIn && d <= rOut;
}

// ---- glyph definition (128-space), mirrors docs/icon.svg ----
const HALF = 4; // stroke-width 8 -> half 4
const RING_IN = 7 - HALF; // 3
const RING_OUT = 7 + HALF; // 11

function rightBranchPoints() {
  const pts = [
    [83, 47],
    [83, 63],
  ];
  const cx = 65, cy = 63, r = 18, steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2);
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  pts.push([59, 81]);
  return pts;
}
const RIGHT_BRANCH = rightBranchPoints();
const LEFT_LINE = [
  [45, 47],
  [45, 81],
];
const ARROW = [
  [65, 76],
  [58, 82],
  [65, 88],
];

function inGlyph(x, y) {
  return (
    inAnnulus(x, y, 45, 40, RING_IN, RING_OUT) ||
    inAnnulus(x, y, 45, 88, RING_IN, RING_OUT) ||
    inAnnulus(x, y, 83, 40, RING_IN, RING_OUT) ||
    onPolyline(x, y, LEFT_LINE, HALF) ||
    onPolyline(x, y, RIGHT_BRANCH, HALF) ||
    onPolyline(x, y, ARROW, HALF)
  );
}

const C0 = [45, 120, 235]; // #2D78EB
const C1 = [106, 92, 255]; // #6A5CFF

// Render at hi-res.
for (let py = 0; py < HR; py++) {
  for (let px = 0; px < HR; px++) {
    const x = (px + 0.5) / SS; // 128-space
    const y = (py + 0.5) / SS;
    const i = (py * HR + px) * 4;

    if (!inRoundedRect(x, y, 8, 8, S - 8, S - 8, 30)) continue; // transparent

    const t = clamp((x + y - 20) / (216 - 20), 0, 1);
    let r = lerp(C0[0], C1[0], t);
    let g = lerp(C0[1], C1[1], t);
    let b = lerp(C0[2], C1[2], t);
    const sheen = 0.2 * clamp(1 - (y - 8) / 72, 0, 1);
    r = lerp(r, 255, sheen);
    g = lerp(g, 255, sheen);
    b = lerp(b, 255, sheen);
    set(i, Math.round(r), Math.round(g), Math.round(b), 1);

    if (!inRoundedRect(x, y, 9.5, 9.5, S - 9.5, S - 9.5, 28.5)) {
      set(i, 255, 255, 255, 0.16); // inner hairline highlight
    }

    if (inGlyph(x, y - 2.5)) set(i, 10, 27, 61, 0.32); // soft shadow
    if (inGlyph(x, y)) set(i, 255, 255, 255, 1); // white glyph
  }
}

// Downsample (box filter) to final size.
const out = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * HR + (x * SS + sx)) * 4;
        const sa = data[i + 3];
        r += data[i] * sa;
        g += data[i + 1] * sa;
        b += data[i + 2] * sa;
        a += sa;
      }
    }
    const o = (y * S + x) * 4;
    if (a > 0) {
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
    }
    out[o + 3] = Math.round(a / (SS * SS));
  }
}

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
  out.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
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
