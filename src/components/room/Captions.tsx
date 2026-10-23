"use client";

/**
 * The current question as captions, always on (an accessibility requirement).
 * The word being spoken is highlighted from the lip-sync timeline.
 */

import { Fragment, useEffect, useState } from "react";

type Span = { charStart: number; charEnd: number };

export function Captions({
  text,
  lead,
  intro,
  spoken = null,
  readSpokenWord,
}: {
  text: string;
  lead?: string | null;
  intro?: string | null;
  /** Exactly what is being spoken now (the lines joined), or null when silent. */
  spoken?: string | null;
  /** The word being said in `spoken`, as [start, end) offsets. */
  readSpokenWord?: (spoken: string) => Span | null;
}) {
  const [word, setWord] = useState<Span | null>(null);

  // Follow the voice frame by frame; re-render only when the word changes.
  useEffect(() => {
    if (!spoken || !readSpokenWord) return;
    let raf = 0;
    let shown: Span | null = null;
    const tick = () => {
      const next = readSpokenWord(spoken);
      if (next?.charStart !== shown?.charStart || next?.charEnd !== shown?.charEnd) {
        shown = next;
        setWord(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setWord(null);
    };
  }, [spoken, readSpokenWord]);

  const before = [intro, lead].filter(Boolean).join(" ");
  // Where each displayed line sits inside the spoken text (-1: not being said).
  const beforeAt = spoken && before ? spoken.indexOf(before) : -1;
  const textAt = spoken ? spoken.indexOf(text, Math.max(0, beforeAt + before.length)) : -1;
  const active = spoken ? word : null;

  return (
    <div className="flex flex-col gap-2">
      {/* Screen readers hear each line once; the captions below change with every word spoken. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {[before, text].filter(Boolean).join(" ")}
      </p>
      {before && (
        <p aria-hidden="true" className="text-base text-muted">
          <Highlighted line={before} offset={beforeAt} word={active} />
        </p>
      )}
      <p aria-hidden="true" className="text-xl leading-relaxed text-ink sm:text-2xl">
        <Highlighted line={text} offset={textAt} word={active} />
      </p>
    </div>
  );
}

/** The line, with the word at [word] (offsets into the spoken text) marked. */
function Highlighted({ line, offset, word }: { line: string; offset: number; word: Span | null }) {
  if (offset < 0 || !word) return <>{line}</>;
  const parts = line.split(/(\s+)/);
  // Each part's start in the spoken text: the line's offset plus everything before it.
  const starts = parts.map((_, i) => offset + parts.slice(0, i).join("").length);
  return (
    <>
      {parts.map((part, i) => {
        const start = starts[i];
        const end = start + part.length;
        const current = part.trim() !== "" && start < word.charEnd && end > word.charStart;
        return current ? (
          <span key={i} className="rounded bg-highlight text-ink transition-colors duration-75">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        );
      })}
    </>
  );
}
