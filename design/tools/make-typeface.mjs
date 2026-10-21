/**
 * TTF -> three.js typeface JSON for the 3D lettering (mirrors three's
 * TTFLoader.parse; printable ASCII only). opentype.js isn't a project
 * dependency, so run it from a folder where it's installed:
 *
 *   npm i --no-save opentype.js@1.3.4
 *   node <repo>/design/tools/make-typeface.mjs ComicNeue-Bold.ttf <out.typeface.json>
 *
 * Source font: Comic Neue Bold (SIL OFL 1.1); see THIRD_PARTY_NOTICES.md.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node make-typeface.mjs <font.ttf> <out.typeface.json>");
  process.exit(1);
}

// Resolve opentype.js from the current working directory, not this file.
const opentype = createRequire(`${process.cwd()}/`)("opentype.js");

/** Printable ASCII, plus the middle dot and typographic apostrophe. */
const KEEP = new Set([...Array.from({ length: 95 }, (_, i) => 32 + i), 0xb7, 0x2019]);

const buffer = readFileSync(input);
const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

const round = Math.round;
const scale = 100000 / ((font.unitsPerEm || 2048) * 72);
const glyphs = {};
const glyphIndexMap = font.encoding.cmap.glyphIndexMap;

for (const unicode of Object.keys(glyphIndexMap)) {
  const code = Number(unicode);
  if (!KEEP.has(code)) continue;
  const glyph = font.glyphs.get(glyphIndexMap[unicode]);
  const token = {
    ha: round(glyph.advanceWidth * scale),
    x_min: round((glyph.xMin ?? 0) * scale),
    x_max: round((glyph.xMax ?? 0) * scale),
    o: "",
  };
  for (const command of glyph.path.commands) {
    const type = command.type.toLowerCase() === "c" ? "b" : command.type.toLowerCase();
    token.o += `${type} `;
    if (command.x !== undefined && command.y !== undefined) token.o += `${round(command.x * scale)} ${round(command.y * scale)} `;
    if (command.x1 !== undefined && command.y1 !== undefined) token.o += `${round(command.x1 * scale)} ${round(command.y1 * scale)} `;
    if (command.x2 !== undefined && command.y2 !== undefined) token.o += `${round(command.x2 * scale)} ${round(command.y2 * scale)} `;
  }
  glyphs[String.fromCodePoint(code)] = token;
}

const name = (key) => font.names?.[key]?.en ?? "";
const typeface = {
  glyphs,
  familyName: font.getEnglishName("fullName"),
  ascender: round(font.ascender * scale),
  descender: round(font.descender * scale),
  underlinePosition: font.tables.post.underlinePosition,
  underlineThickness: font.tables.post.underlineThickness,
  boundingBox: {
    xMin: font.tables.head.xMin,
    xMax: font.tables.head.xMax,
    yMin: font.tables.head.yMin,
    yMax: font.tables.head.yMax,
  },
  resolution: 1000,
  original_font_information: { copyright: name("copyright"), license: name("license"), licenseURL: name("licenseURL") },
};

writeFileSync(output, JSON.stringify(typeface));
console.log(`${Object.keys(glyphs).length} glyphs -> ${output}`);
