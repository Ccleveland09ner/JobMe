"use client";

import { useState } from "react";

/**
 * The value for `key` once it is ready (non-null), and until then the last
 * one that was: a document being laid out keeps the previous one on screen
 * rather than blinking out.
 */
export function useLastReady<T>(key: string, value: T | null): { key: string; value: T } | null {
  const [last, setLast] = useState<{ key: string; value: T } | null>(null);
  if (value !== null && last?.key !== key) setLast({ key, value });
  return value !== null ? { key, value } : last;
}
