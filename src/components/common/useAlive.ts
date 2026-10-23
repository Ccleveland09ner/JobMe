"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * True while the component is mounted. Async work that can outlive it (a
 * permission prompt, a request) checks it before acting on the page:
 * holding the microphone, playing a sound, refreshing or navigating.
 */
export function useAlive(): RefObject<boolean> {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}
