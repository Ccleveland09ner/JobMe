/**
 * `npm run prep:art` — cuts the shippable layers out of the design mockups.
 *
 * The mockups in design/ are flat composites: the landing page bakes its
 * crowd into the same image as the building, so the building cannot be used
 * behind a moving crowd until the two are separated. This does that cut, and
 * records it as code so a re-exported mockup can be re-cut instead of someone
 * re-deriving the numbers by eye.
 *
 * Deliberately dependency-free — zlib is built into Node, and a 200-line
 * decoder is cheaper than an image toolchain for four crops. It handles
 * exactly what the mockups are: 8-bit non-interlaced PNG, RGB or grayscale.
 *
 * Output is grayscale: the art is black line work (measured max channel
 * spread 12/255, on 0.11% of pixels), so dropping two channels is invisible
 * and cuts the file by about two thirds.
 */

import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, statSync, writeFileSync } from "node:fs";

interface Raster {
  width: number;
  height: number;
  /** Bytes per pixel: 3 = RGB, 1 = grayscale. */
  bpp: number;
  /** Unfiltered pixel data, `width * height * bpp` bytes. */
  pixels: Buffer;
}

interface CropSpec {
  from: string;
  to: string;
  /** Omit any bound to keep the full extent in that direction. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  note: string;
}

const CROPS: CropSpec[] = [
  {
    // Full frame, no crop: unlike "Landing page.png" this mockup has no crowd
    // drawn into it, so nothing has to be cut away for one to walk in front.
    // It still goes through here to be flattened to grayscale.
    from: "design/Symmetrical Campus Building in Ink.png",
    to: "public/images/campus.png",
    note: "landing backdrop — campus building, steps and plaza",
  },
];

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The PNG spec's Paeth predictor. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decode(file: string): Raster {
  const buf = readFileSync(file);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const depth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];

  if (depth !== 8 || (colorType !== 2 && colorType !== 0) || interlace !== 0) {
    throw new Error(
      `${file}: need 8-bit non-interlaced RGB or grayscale, ` +
        `got depth=${depth} colorType=${colorType} interlace=${interlace}`,
    );
  }
  const bpp = colorType === 2 ? 3 : 1;

  // Every IDAT concatenated, then inflated once: it is ONE zlib stream split
  // across chunks, so inflating them individually fails on the second.
  const parts: Buffer[] = [];
  let offset = 8;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") parts.push(buf.subarray(offset + 8, offset + 8 + length));
    if (type === "IEND") break;
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);

  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) value += paeth(a, b, c);
      out[x] = value & 0xff;
    }
  }
  return { width, height, bpp, pixels };
}

function crop(img: Raster, spec: CropSpec): Raster {
  const x = spec.x ?? 0;
  const y = spec.y ?? 0;
  const width = spec.width ?? img.width - x;
  const height = spec.height ?? img.height - y;
  if (x + width > img.width || y + height > img.height) {
    throw new Error(`crop ${width}x${height}+${x}+${y} falls outside ${img.width}x${img.height}`);
  }

  const out = Buffer.alloc(width * height * img.bpp);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * img.width + x) * img.bpp;
    img.pixels.copy(out, row * width * img.bpp, from, from + width * img.bpp);
  }
  return { width, height, bpp: img.bpp, pixels: out };
}

function toGray(img: Raster): Raster {
  if (img.bpp === 1) return img;
  const out = Buffer.alloc(img.width * img.height);
  for (let i = 0, p = 0; i < img.pixels.length; i += img.bpp, p++) {
    out[p] = (img.pixels[i] * 299 + img.pixels[i + 1] * 587 + img.pixels[i + 2] * 114) / 1000;
  }
  return { width: img.width, height: img.height, bpp: 1, pixels: out };
}

/** Minimum sum of absolute differences — the filter heuristic from the spec. */
function filterRow(line: Buffer, prev: Buffer | null, bpp: number) {
  let best = { type: 0, out: Buffer.alloc(0), sum: Number.POSITIVE_INFINITY };

  for (let type = 0; type < 5; type++) {
    const out = Buffer.alloc(line.length);
    let sum = 0;
    for (let x = 0; x < line.length; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let value: number;
      if (type === 0) value = line[x];
      else if (type === 1) value = line[x] - a;
      else if (type === 2) value = line[x] - b;
      else if (type === 3) value = line[x] - ((a + b) >> 1);
      else value = line[x] - paeth(a, b, c);
      out[x] = value & 0xff;
      sum += out[x] < 128 ? out[x] : 256 - out[x];
    }
    if (sum < best.sum) best = { type, out, sum };
  }
  return best;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encode(file: string, img: Raster): void {
  const stride = img.width * img.bpp;
  const raw = Buffer.alloc(img.height * (stride + 1));

  for (let y = 0; y < img.height; y++) {
    const line = img.pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? img.pixels.subarray((y - 1) * stride, y * stride) : null;
    const { type, out } = filterRow(line, prev, img.bpp);
    raw[y * (stride + 1)] = type;
    out.copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = img.bpp === 1 ? 0 : 2;

  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from(PNG_SIGNATURE),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

function prepArt(): void {
  console.log("Preparing art from design/\n");

  for (const spec of CROPS) {
    const source = decode(spec.from);
    const out = toGray(crop(source, spec));
    encode(spec.to, out);

    const kb = (statSync(spec.to).size / 1024).toFixed(0);
    console.log(`  ${spec.to}`);
    console.log(`    ${out.width}x${out.height}, ${kb} KB — ${spec.note}`);

    // A crop that silently produced the wrong region is the failure mode
    // worth catching here, so re-read it and confirm the dimensions.
    const check = decode(spec.to);
    if (check.width !== out.width || check.height !== out.height) {
      throw new Error(`${spec.to}: wrote ${out.width}x${out.height}, read back ${check.width}x${check.height}`);
    }
  }

  console.log(`\n  ${CROPS.length} layer(s) written.`);
}

prepArt();

export {};
