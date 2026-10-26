"use client";

/**
 * Reading a signpost up close. useSignPostView: which one is open
 * (building.focus, which the camera glides to: CameraRig.tsx) and whether the
 * camera has arrived there; the scene's words and the page both read it.
 * useSignPostNavigation adds the ways to move (open, close, next, back), their
 * keys (Escape, ArrowRight, ArrowLeft), and focus: into the view, and back on
 * close to whatever opened it. Without 3D a signpost is "there" at once.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useBuilding } from "../BuildingProvider";
import type { Poster } from "./copy";
import { isPoster, POSTER_ORDER } from "./layout";

/** How long to wait for the camera to start moving before taking it as already there (ms). */
const NEVER_MOVED_MS = 500;

export interface SignPostView {
  /** The signpost up close (or on its way), or null. */
  open: Poster | null;
  /** The camera has come to rest at `open`: its writing and words can show. */
  arrived: boolean;
  /** The signpost after or before `open`, if any. */
  next: Poster | null;
  previous: Poster | null;
}

export function useSignPostView(): SignPostView {
  const building = useBuilding();
  const focus = building?.focus ?? null;
  const open = isPoster(focus) ? focus : null;
  const show3D = building?.show3D ?? false;
  const cameraAt = building?.cameraAt ?? null;

  // Arrived once the camera has moved (cameraAt null) and come to rest again, for this signpost.
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

  const at = open === null ? -1 : POSTER_ORDER.indexOf(open);
  const next = at >= 0 && at < POSTER_ORDER.length - 1 ? POSTER_ORDER[at + 1] : null;
  const previous = at > 0 ? POSTER_ORDER[at - 1] : null;
  return { open, arrived, next, previous };
}

export interface SignPostNavigation extends SignPostView {
  openPoster: (poster: Poster) => void;
  close: () => void;
  /** To the next or previous signpost, once arrived (a glide under way finishes first). */
  goNext: () => void;
  goBack: () => void;
}

export function useSignPostNavigation(): SignPostNavigation {
  const building = useBuilding();
  const setHovered = building?.setHovered;
  const focusOn = building?.setFocus;
  // Moving hides the word just clicked before the pointer can leave it: let go of it, or it stays lit (and the cursor a hand).
  const setFocus = useCallback(
    (name: string | null) => {
      setHovered?.(null);
      focusOn?.(name);
    },
    [setHovered, focusOn],
  );
  const view = useSignPostView();
  const { open, arrived, next, previous } = view;

  /** What had focus when the first signpost opened, to give it back. */
  const opener = useRef<HTMLElement | null>(null);
  const openPoster = useCallback(
    (poster: Poster) => {
      if (!isPoster(building?.focus ?? null)) {
        const active = document.activeElement;
        opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      }
      setFocus(poster);
    },
    [building?.focus, setFocus],
  );

  /** Where focus goes once the view has closed (and the page is no longer inert). */
  const restore = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    restore.current = opener.current;
    opener.current = null;
    setFocus(null);
  }, [setFocus]);
  useEffect(() => {
    if (open !== null || !restore.current) return;
    restore.current.focus({ preventScroll: true });
    restore.current = null;
  }, [open]);

  const goNext = useCallback(() => {
    if (next && arrived) setFocus(next);
  }, [next, arrived, setFocus]);
  const goBack = useCallback(() => {
    if (previous && arrived) setFocus(previous);
  }, [previous, arrived, setFocus]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" && next) goNext();
      else if (e.key === "ArrowLeft" && previous) goBack();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, previous, close, goNext, goBack]);

  return { ...view, openPoster, close, goNext, goBack };
}
