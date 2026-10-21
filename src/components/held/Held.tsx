"use client";

/**
 * What every held document shares (a focused title, a tag that puts it down,
 * Escape), HeldPad (the room's notepad), and Pages, turned one at a time.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import type { Held } from "@/components/building/heldMachine";

import { useHeld } from "./useHeld";

interface ShellProps {
  title: string;
  /** Small print above the title: whose it is, what it is. */
  kicker?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
  headingLevel?: "h1" | "h2";
}

/** Focus the heading on open; Escape closes. */
export function useHeldShell(name: Held, onClose: () => void) {
  const { closing } = useHeld(name);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A dialog open on top (a delete confirmation) owns Escape.
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("dialog[open]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return { closing, heading };
}

/** The paper tag tied to a held document that puts it down. */
export function CloseTag({
  onClick,
  disabled,
  className = "",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`held-tag disabled:opacity-60 ${className}`.trim()}>
      {children}
    </button>
  );
}

const SHADOW = "absolute -bottom-5 inset-x-10 h-8 rounded-[50%] bg-ink/25";

export function HeldPad({ title, kicker, onClose, closeLabel = "Put the notepad down", children, headingLevel = "h2" }: ShellProps) {
  const { closing, heading } = useHeldShell("notepad", onClose);
  const id = useId();
  const H = headingLevel;
  return (
    <section aria-labelledby={id} className={`relative w-full max-w-xl pb-6 pt-4 ${closing ? "held-out" : "held-in"}`}>
      <div aria-hidden="true" className={SHADOW} />
      {/* The spiral, along the top. */}
      <div aria-hidden="true" className="absolute inset-x-10 top-0 z-10 flex justify-between">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="h-8 w-3 rounded-full border-[3px] border-ink bg-clipmetal" />
        ))}
      </div>
      <div className="relative rounded-2xl border-[3px] border-ink bg-fabric p-2 shadow-[0_8px_0_-2px_var(--color-ink),0_8px_0_1px_var(--color-ink)]">
        <div className="grain relative rounded-lg border-2 border-ink bg-paper">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-dashed border-ink/20 px-5 pb-3 pt-7">
            <div className="flex flex-col gap-0.5">
              {kicker && <p className="text-xs font-semibold uppercase tracking-widest text-muted">{kicker}</p>}
              <H id={id} ref={heading} tabIndex={-1} className="text-lg font-semibold text-ink outline-none focus-visible:outline-none">
                {title}
              </H>
            </div>
            <Button variant="secondary" size="sm" onClick={onClose}>
              {closeLabel}
            </Button>
          </header>
          <div className="px-5 pb-5 pt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** Pages turned one at a time ("side" like a book, "up" like a notepad); arrow keys turn them. */
export function Pages({
  page,
  count,
  onTurn,
  label,
  axis = "side",
  pageLabel,
  children,
}: {
  page: number;
  count: number;
  onTurn: (page: number) => void;
  /** What the pages are, for the controls: "Ledger section", "Note". */
  label: string;
  axis?: "side" | "up";
  pageLabel: (page: number) => string;
  children: ReactNode;
}) {
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const turn = (to: number) => {
    if (to < 0 || to >= count || to === page) return;
    setDirection(to > page ? "next" : "prev");
    onTurn(to);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "ArrowRight") turn(page + 1);
      else if (e.key === "ArrowLeft") turn(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const animation = axis === "up" ? "page-up" : direction === "next" ? "page-next" : "page-prev";
  return (
    <div className="flex flex-col gap-5">
      <div key={page} className={animation}>
        {children}
      </div>
      {count > 1 && (
        <nav aria-label={`${label} pages`} className="flex items-center justify-between gap-3 border-t-2 border-dashed border-ink/20 pt-4">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => turn(page - 1)}>
            <span aria-hidden="true">←</span> {page > 0 ? pageLabel(page - 1) : "Previous"}
          </Button>
          <span className="text-xs text-muted tabular-nums">
            {page + 1} / {count}
          </span>
          <Button variant="ghost" size="sm" disabled={page === count - 1} onClick={() => turn(page + 1)}>
            {page < count - 1 ? pageLabel(page + 1) : "Next"} <span aria-hidden="true">→</span>
          </Button>
        </nav>
      )}
    </div>
  );
}
