// Builds a few real, valid local PNG files for fixture posts to reference,
// so the vision pass (BUILD.md step 7) has actual images to classify instead
// of a dead "fixture.local" URL. Pure Node + zlib, no image library needed.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const MEDIA_DIR = path.join(process.cwd(), "fixtures", "media");
if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width: number, height: number, getPixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const [r, g, b] = getPixel(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdrData),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const W = 240;
const H = 160;

// chart.png -- a handful of vertical bars, like a bar chart screenshot.
const barHeights = [40, 90, 60, 120, 75, 100, 50];
function encodeChart(): Buffer {
  return encodePng(W, H, (x, y) => {
    const barWidth = W / barHeights.length;
    const barIndex = Math.floor(x / barWidth);
    const barHeight = barHeights[barIndex] ?? 0;
    const isBar = H - y <= barHeight;
    return isBar ? [59, 130, 246] : [245, 247, 250];
  });
}

// textcard.png -- dark background with a lighter centered band, like a quote card.
function encodeTextCard(): Buffer {
  return encodePng(W, H, (_x, y) => {
    const inBand = y > H * 0.35 && y < H * 0.65;
    return inBand ? [250, 250, 248] : [30, 32, 40];
  });
}

// photo.png -- a smooth horizontal gradient, standing in for a generic photo/screen.
function encodePhoto(): Buffer {
  return encodePng(W, H, (x) => {
    const t = x / W;
    return [Math.round(255 * t), Math.round(120 + 80 * (1 - t)), Math.round(180 * (1 - t) + 40)];
  });
}

writeFileSync(path.join(MEDIA_DIR, "chart.png"), encodeChart());
writeFileSync(path.join(MEDIA_DIR, "textcard.png"), encodeTextCard());
writeFileSync(path.join(MEDIA_DIR, "photo.png"), encodePhoto());

console.log(`Wrote 3 placeholder images to ${MEDIA_DIR}`);
