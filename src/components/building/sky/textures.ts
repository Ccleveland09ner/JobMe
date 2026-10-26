"use client";

/**
 * The sky's few textures, drawn on a canvas once and shared by everything that
 * uses them; the last user to unmount disposes of them.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";

export interface CanvasArt {
  width: number;
  height: number;
  /** A colour map (sRGB), rather than data such as an alpha map. */
  color: boolean;
  /** Tiles across a surface (uvs past 1), rather than stretching once over it. */
  repeat?: boolean;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

/** A repeatable random sequence in [0, 1): the same clouds and stars on every visit. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shared = new Map<CanvasArt, THREE.CanvasTexture>();
const users = new Map<THREE.CanvasTexture, number>();

function sharedTexture(art: CanvasArt): THREE.CanvasTexture {
  let texture = shared.get(art);
  if (!texture) {
    texture = paint(art);
    shared.set(art, texture);
  }
  return texture;
}

/** Counts a user in; the returned release disposes of the texture after the last one. */
function retain(art: CanvasArt, texture: THREE.CanvasTexture): () => void {
  users.set(texture, (users.get(texture) ?? 0) + 1);
  // A disposed texture uploads again if it's drawn again (Strict Mode remounts).
  shared.set(art, texture);
  return () => {
    const left = (users.get(texture) ?? 1) - 1;
    if (left > 0) {
      users.set(texture, left);
      return;
    }
    users.delete(texture);
    shared.delete(art);
    texture.dispose();
  };
}

function paint(art: CanvasArt): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = art.width;
  canvas.height = art.height;
  const ctx = canvas.getContext("2d");
  if (ctx) art.draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  if (art.color) texture.colorSpace = THREE.SRGBColorSpace;
  if (art.repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function useCanvasTexture(art: CanvasArt): THREE.CanvasTexture {
  const [texture] = useState(() => sharedTexture(art));
  useEffect(() => retain(art, texture), [art, texture]);
  return texture;
}

/** A round soft glow, white: lamp halos and stars. */
export const SOFT_DOT: CanvasArt = {
  width: 64,
  height: 64,
  color: true,
  draw(ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.55)");
    g.addColorStop(0.6, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  },
};

/** A small pale moon with a soft halo and two faint seas. */
export const MOON: CanvasArt = {
  width: 128,
  height: 128,
  color: true,
  draw(ctx) {
    const halo = ctx.createRadialGradient(64, 64, 18, 64, 64, 64);
    halo.addColorStop(0, "rgba(255,246,224,0.35)");
    halo.addColorStop(1, "rgba(255,246,224,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 128, 128);
    const disc = ctx.createRadialGradient(60, 60, 0, 64, 64, 22);
    disc.addColorStop(0, "rgba(255,252,240,1)");
    disc.addColorStop(0.85, "rgba(244,238,220,1)");
    disc.addColorStop(1, "rgba(244,238,220,0)");
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(64, 64, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(196,196,186,0.35)";
    for (const [x, y, r] of [
      [57, 58, 6],
      [70, 69, 4.5],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};

/** The cloud atlas: four cells (2 × 2) of cumulus, each twice as wide as tall. */
export const CLOUD_CELLS = 4;
const CELL = { width: 256, height: 128 } as const;

/**
 * Cloud shapes as an alpha map: white puffs on black, flat underneath. An
 * opaque canvas, so no dark fringes where the puffs fade out. The plane's
 * vertex colours shade the undersides (CloudLayers.tsx).
 */
export const CLOUD_ATLAS: CanvasArt = {
  width: CELL.width * 2,
  height: CELL.height * 2,
  color: false,
  draw(ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CELL.width * 2, CELL.height * 2);
    for (let cell = 0; cell < CLOUD_CELLS; cell++) {
      const left = (cell % 2) * CELL.width;
      const top = Math.floor(cell / 2) * CELL.height;
      const random = seededRandom(cell * 7919 + 17);
      const base = top + CELL.height * 0.74;
      const margin = 4;
      const puff = (x: number, y: number, radius: number, density: number) => {
        // Never past the cell: neighbours would bleed in.
        const r = Math.min(radius, x - left - margin, left + CELL.width - margin - x, y - top - margin);
        if (r <= 2) return;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${density})`);
        g.addColorStop(0.5, `rgba(255,255,255,${density * 0.55})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      };
      ctx.globalCompositeOperation = "lighter";
      // The body: bigger puffs toward the middle, sitting on the base.
      const body = 9 + Math.floor(random() * 5);
      for (let i = 0; i < body; i++) {
        const u = 0.18 + 0.64 * random();
        const middle = 1 - 2 * Math.abs(u - 0.5);
        const r = CELL.height * (0.13 + 0.22 * middle) * (0.8 + 0.4 * random());
        puff(left + u * CELL.width, base - r * 0.5 - random() * 6, r, 0.55 + 0.3 * random());
      }
      // Smaller billows along the top for detail.
      const billows = 6 + Math.floor(random() * 4);
      for (let i = 0; i < billows; i++) {
        const u = 0.25 + 0.5 * random();
        const middle = 1 - 2 * Math.abs(u - 0.5);
        const r = CELL.height * (0.07 + 0.08 * random());
        puff(left + u * CELL.width, base - CELL.height * (0.18 + 0.28 * middle) - random() * 8, r, 0.35 + 0.3 * random());
      }
      // Flatten the underside: fade the puffs out below the base.
      ctx.globalCompositeOperation = "source-over";
      const flat = ctx.createLinearGradient(0, base - 4, 0, base + 14);
      flat.addColorStop(0, "rgba(0,0,0,0)");
      flat.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = flat;
      ctx.fillRect(left, base - 4, CELL.width, top + CELL.height - (base - 4));
    }
  },
};
