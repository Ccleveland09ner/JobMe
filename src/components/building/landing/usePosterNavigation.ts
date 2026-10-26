"use client";

/**
 * The posters' close-ups: which one is open (building.focus, which the camera
 * glides to: CameraRig.tsx), whether the camera has arrived there, and the
 * ways to move: open, close, next, previous, and the keys for them (Escape,
 * ArrowRight, ArrowLeft). Without 3D a poster is "there" at once. Focus goes
 * back on close to whatever opened the first poster.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useBuilding } from "../BuildingProvider";
import type { Poster } from "./copy";
import { isPoster, POSTER_ORDER } from "./layout";

/** How long to wait for the camera to start moving before taking it as already there (ms). */
const NEVER_MOVED_MS = 500;

export interface PosterNavigation {
  /** The poster up close (or on its way), or null. */
  open: Poster | null;
  /** The camera has come to rest at `open`: its writing can show. */
  arrived: boolean;
  openPoster: (poster: Poster) => void;
  close: () => void;
  /** The poster after or before `open`, if any. */
  next: Poster | null;
  previous: Poster | null;
}

export function usePosterNavigation(): PosterNavigation {
  const building = useBuilding();
  const setFocus = building?.setFocus;
  const focus = building?.focus ?? null;
  const open = isPoster(focus) ? focus : null;
  const show3D = building?.show3D ?? false;
  const cameraAt = building?.cameraAt ?? null;

  // Arrived once the camera has moved (cameraAt null) and come to rest again, for this poster.
  const [moved, setMoved] = useState(false);
  const [arrivedAt, setArrivedAt] = useState<Poster | null>(null);
  if (open === null && (moved || arrivedAt !== null)) {
    setMoved(false);
    setArrivedAt(null);
  } else if (open !== null && cameraAt === null && !moved) {
    setMoved(true);
  } else if (open !== null && moved && cameraAt === "street") {
    setMoved(false);
    setArrivedAt(open);
  }
  const arrived = open !== null && (!show3D || arrivedAt === open);
  // A safety net: if the camera was never seen moving (reduced motion cuts at once), it has still arrived.
  // A glide that was seen starting is waited for, however slowly it runs.
  useEffect(() => {
    if (open === null || moved) return;
    const timer = window.setTimeout(() => setArrivedAt(open), NEVER_MOVED_MS);
    return () => window.clearTimeout(timer);
  }, [open, moved]);

  /** What had focus when the first poster opened, to give it back. */
  const opener = useRef<HTMLElement | null>(null);

  const openPoster = useCallback(
    (poster: Poster) => {
      if (!isPoster(building?.focus ?? null)) {
        const active = document.activeElement;
        opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      }
      setFocus?.(poster);
    },
    [building?.focus, setFocus],
  );

  /** Where focus goes once the poster has closed (and the page is no longer inert). */
  const restore = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    restore.current = opener.current;
    opener.current = null;
    setFocus?.(null);
  }, [setFocus]);
  useEffect(() => {
    if (open !== null || !restore.current) return;
    restore.current.focus({ preventScroll: true });
    restore.current = null;
  }, [open]);

  const at = open === null ? -1 : POSTER_ORDER.indexOf(open);
  const next = at >= 0 && at < POSTER_ORDER.length - 1 ? POSTER_ORDER[at + 1] : null;
  const previous = at > 0 ? POSTER_ORDER[at - 1] : null;

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") close();
      // Between posters only once there: a glide under way finishes first.
      else if (e.key === "ArrowRight" && next && arrived) setFocus?.(next);
      else if (e.key === "ArrowLeft" && previous && arrived) setFocus?.(previous);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, previous, arrived, close, setFocus]);

  return { open, arrived, openPoster, close, next, previous };
}
