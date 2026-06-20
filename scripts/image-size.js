/* ==========================================================
   image-size.js — Derradj Shop
   Tiny, dependency-free image dimension reader (PNG / JPEG /
   WebP / GIF) used by scripts/generate-product-pages.js to
   fill og:image:width / og:image:height accurately.
   ========================================================== */
'use strict';

function readPNG(buf) {
  if (buf.length < 24) return null;
  const sig = buf.subarray(0, 8);
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!sig.equals(PNG_SIG)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readGIF(buf) {
  if (buf.length < 10) return null;
  const header = buf.toString('ascii', 0, 6);
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

function readJPEG(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) { pos++; continue; }
    const marker = buf[pos + 1];
    pos += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) continue;
    if (pos + 2 > buf.length) break;
    const len = buf.readUInt16BE(pos);
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      if (pos + 7 > buf.length) return null;
      return { height: buf.readUInt16BE(pos + 3), width: buf.readUInt16BE(pos + 5) };
    }
    pos += len;
  }
  return null;
}

function readWebP(buf) {
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fourCC = buf.toString('ascii', 12, 16);
  const chunkData = 20;

  if (fourCC === 'VP8X') {
    const width = (buf.readUIntLE(chunkData + 4, 3)) + 1;
    const height = (buf.readUIntLE(chunkData + 7, 3)) + 1;
    return { width, height };
  }
  if (fourCC === 'VP8 ') {
    const w = buf.readUInt16LE(chunkData + 6) & 0x3fff;
    const h = buf.readUInt16LE(chunkData + 8) & 0x3fff;
    return { width: w, height: h };
  }
  if (fourCC === 'VP8L') {
    if (buf[chunkData] !== 0x2f) return null;
    const v = buf.readUInt32LE(chunkData + 1);
    return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** Reads width/height from an image Buffer. Returns null if format is unrecognized. */
function getImageSize(buf) {
  return readPNG(buf) || readJPEG(buf) || readWebP(buf) || readGIF(buf) || null;
}

module.exports = { getImageSize };
