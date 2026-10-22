"use client";

/**
 * Shrinks a fixed-size object (the setup clipboard) to fit the screen, never
 * enlarging it; the space it takes shrinks with it. Measured untransformed,
 * so an animation on the object doesn't skew the fit.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

export function ScaleToFit({ reserveHeight = 0, children }: { reserveHeight?: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const box = outer.current;
    const object = inner.current;
    if (!box || !object) return;
    const measure = () => {
      const width = object.offsetWidth;
      const height = object.offsetHeight;
      const scale = Math.min(1, box.clientWidth / width, (window.innerHeight - reserveHeight) / height);
      setFit((prev) =>
        prev && prev.scale === scale && prev.width === width && prev.height === height ? prev : { scale, width, height },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(object);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [reserveHeight]);

  const scale = fit?.scale ?? 1;
  return (
    <div ref={outer} className="flex w-full justify-center">
      <div style={fit && scale < 1 ? { width: fit.width * scale, height: fit.height * scale } : undefined}>
        <div ref={inner} className="w-max origin-top-left" style={scale < 1 ? { transform: `scale(${scale})` } : undefined}>
          {children}
        </div>
      </div>
    </div>
  );
}
