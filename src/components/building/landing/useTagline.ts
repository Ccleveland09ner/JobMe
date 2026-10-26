"use client";

/**
 * Which tagline the landing page shows: picked once per mount, at random,
 * never the one shown last time (remembered in this browser). Null on the
 * server and through hydration, so the server's HTML matches; the browser
 * picks straight after, never during the server render.
 */

import { useState, useSyncExternalStore } from "react";

import { TAGLINES } from "./copy";

const LAST_KEY = "jobme.tagline.last";

/** A random index below `count`, other than `last` when there is a choice. */
export function pickTagline(count: number, last: number | null, random: () => number = Math.random): number {
  if (count <= 1) return 0;
  const avoid = last !== null && last >= 0 && last < count;
  const i = Math.floor(random() * (avoid ? count - 1 : count));
  return avoid && i >= last ? i + 1 : i;
}

function readLast(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isInteger(n) ? n : null;
  } catch {
    return null;
  }
}

function remember(index: number) {
  try {
    window.localStorage.setItem(LAST_KEY, String(index));
  } catch {
    // Not stored (private mode): next time is simply random.
  }
}

/** One pick per mounted page, made the first time the browser asks. */
const picks = new WeakMap<object, number>();

function pickFor(mount: object): number {
  let index = picks.get(mount);
  if (index === undefined) {
    index = pickTagline(TAGLINES.length, readLast());
    remember(index);
    picks.set(mount, index);
  }
  return index;
}

const noSubscribe = () => () => {};

export function useTagline(): string | null {
  // A new page mount (a visit, or coming back out after signing out) is a new pick.
  const [mount] = useState(() => ({}));
  const index = useSyncExternalStore(
    noSubscribe,
    () => pickFor(mount),
    () => null,
  );
  return index === null ? null : TAGLINES[index];
}
