/**
 * The sky's colours by time of day. Light tints multiply the colours Lighting.tsx
 * declares (so day leaves them as they are), and only outdoors.
 */

import type { TimeOfDay } from "./timeOfDay";

export const SKY_COLORS = ["zenith", "mid", "horizon", "glow", "cloud", "hemi", "key", "fill"] as const;
export const SKY_NUMBERS = ["glowStrength", "cloudOpacity", "stars", "moon", "lamp", "hemiFactor", "keyFactor", "fillFactor"] as const;

export type SkyColor = (typeof SKY_COLORS)[number];
export type SkyNumber = (typeof SKY_NUMBERS)[number];

/**
 * zenith → mid → horizon: the gradient, top to bottom (the horizon is also the fog).
 * glow: the low sun's warmth at dusk, toward SUNSET_FROM.
 * cloud: the clouds' tint. stars, moon, lamp: 0 (none, off) to 1.
 * hemi, key, fill: tints on the hemisphere, key and fill lights; *Factor: their intensity.
 */
export type SkySpec = Record<SkyColor, string> & Record<SkyNumber, number>;

export const SKY: Record<TimeOfDay, SkySpec> = {
  day: {
    zenith: "#6e9fd4",
    mid: "#a8cae9",
    horizon: "#e6eee8",
    glow: "#fff1d6",
    glowStrength: 0,
    cloud: "#ffffff",
    cloudOpacity: 0.95,
    stars: 0,
    moon: 0,
    lamp: 0,
    hemi: "#ffffff",
    hemiFactor: 1,
    key: "#ffffff",
    keyFactor: 1,
    fill: "#ffffff",
    fillFactor: 1,
  },
  dusk: {
    zenith: "#2b306e",
    mid: "#d5788a",
    horizon: "#f3a46f",
    glow: "#ffc27a",
    glowStrength: 0.55,
    cloud: "#ffb39c",
    cloudOpacity: 0.92,
    stars: 0.25,
    moon: 0,
    lamp: 0.6,
    hemi: "#f6c6b0",
    hemiFactor: 0.75,
    key: "#ffb27a",
    keyFactor: 0.7,
    fill: "#b9aee0",
    fillFactor: 0.7,
  },
  night: {
    zenith: "#060a1c",
    mid: "#0d1636",
    horizon: "#1c2a50",
    glow: "#2a3a6a",
    glowStrength: 0,
    cloud: "#5d6a88",
    cloudOpacity: 0.55,
    stars: 1,
    moon: 1,
    lamp: 1,
    hemi: "#7d8fc4",
    hemiFactor: 0.32,
    key: "#a3b6e6",
    keyFactor: 0.2,
    fill: "#7a8ec8",
    fillFactor: 0.35,
  },
};
