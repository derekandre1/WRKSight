#!/usr/bin/env node
/**
 * Generate minimal-but-valid placeholder icons for Tauri.
 *
 * Why this exists:
 *   tauri-build's Windows resource step requires a real `icon.ico` at
 *   COMPILE time. Without it, `cargo build` / `tauri dev` fails on Windows
 *   before any dev server starts. We commit deterministic placeholder
 *   binaries so the build runs out of the box, then ask the user to swap
 *   in real icons before shipping.
 *
 * Run:
 *   node src-tauri/icons/generate-placeholder-icons.mjs
 *
 * No external deps — uses Node's built-in zlib + Buffer.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// Brand color (matches tailwind brand-600 #2563eb).
const COLOR = { r: 0x25, g: 0x63, b: 0xeb };

// ---------- PNG ----------------------------------------------------

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = makeCrcTable();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function makePng(size, { r, g, b }) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Solid-color RGBA rows, each prefixed with filter byte 0 (None).
  const rowBytes = size * 4;
  const raw = Buffer.alloc(size * (1 + rowBytes));
  for (let y = 0; y < size; y++) {
    const off = y * (1 + rowBytes);
    raw[off] = 0;
    for (let x = 0; x < size; x++) {
      const p = off + 1 + x * 4;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = 0xff;
    }
  }
  const idatData = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- ICO ----------------------------------------------------
//
// PNG-embedded ICO format (valid since Windows Vista — fine for tauri-build).
// Spec: ICONDIR (6) + ICONDIRENTRY (16) + PNG bytes.

function makeIco(entries) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);              // type = icon
  dir.writeUInt16LE(entries.length, 4); // count

  const entryStructs = [];
  let offset = 6 + entries.length * 16;
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0;                       // color palette
    e[3] = 0;                       // reserved
    e.writeUInt16LE(1, 4);          // color planes
    e.writeUInt16LE(32, 6);         // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entryStructs.push(e);
    offset += png.length;
  }

  return Buffer.concat([
    dir,
    ...entryStructs,
    ...entries.map((x) => x.png),
  ]);
}

// ---------- write -------------------------------------------------

const png32 = makePng(32, COLOR);
const png128 = makePng(128, COLOR);
const png256 = makePng(256, COLOR);

writeFileSync(join(HERE, "32x32.png"), png32);
writeFileSync(join(HERE, "128x128.png"), png128);
writeFileSync(join(HERE, "icon.png"), png256);
// Multi-resolution ICO so Windows picks the right one for taskbar / alt-tab / etc.
writeFileSync(
  join(HERE, "icon.ico"),
  makeIco([
    { size: 32, png: png32 },
    { size: 128, png: png128 },
    { size: 256, png: png256 },
  ])
);

console.log("Wrote placeholder icons:");
for (const f of ["32x32.png", "128x128.png", "icon.png", "icon.ico"]) {
  console.log(`  ${f}`);
}
