"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Keeps a mouse press inside from starting a page drag (the engine also
 * cancels the press), so text can be selected and fields focused. A swipe
 * still turns the page on touch screens, where selecting is a long press.
 */
export function FlipSafe({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener("mousedown", stop);
    return () => el.removeEventListener("mousedown", stop);
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
