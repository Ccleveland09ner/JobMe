"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/**
 * A fact about the browser that can't change while the page is open, such as
 * a capability. The server and hydration see `serverValue`, so the first
 * render matches the server's HTML; the real value follows straight after.
 */
export function useBrowserValue<T, S>(read: () => T, serverValue: S): T | S {
  return useSyncExternalStore<T | S>(noSubscribe, read, () => serverValue);
}

/** False on the server and through hydration, true after. */
export function useHydrated(): boolean {
  return useBrowserValue(() => true, false);
}
