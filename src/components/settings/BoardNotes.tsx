"use client";

/**
 * The settings controls, pinned onto the 3D notice board's notes (ScreenAnchor)
 * once the camera arrives, scaled with each note. A note too small to use
 * opens as a close-up. Without 3D the notes are plain cards.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useBuilding, useShow3D } from "@/components/building/BuildingProvider";
import type { BoardNote } from "@/components/building/world";
import { Button } from "@/components/ui/Button";

export interface NoteContent {
  name: BoardNote;
  title: string;
  content: ReactNode;
}

/** Width the writing is laid out at (CSS px), before scaling. */
const WRITING_WIDTH = 400;
/** Below this scale the writing is too small to use. */
const MIN_SCALE = 0.75;

interface Fit {
  scale: number;
  height: number;
}

/** Scale the writing to fill its note, straight onto the style (no render per frame). */
function applyFit(box: HTMLElement | null, { scale, height }: Fit) {
  if (!box) return;
  box.style.transform = `scale(${scale})`;
  box.style.height = `${height / scale}px`;
}

export function BoardNotes({ notes }: { notes: NoteContent[] }) {
  const building = useBuilding();
  const show3D = useShow3D();
  const router = useRouter();
  const focus = building?.focus ?? null;
  const setFocus = building?.setFocus;
  const atBoard =
    building !== null && building.state.station === "noteboard" && building.state.target === null && building.cameraAt === "noteboard";

  // Escape: leave a text field, then a close-up, then the board.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("dialog[open]")) return;
      const field = e.target instanceof HTMLElement && e.target.matches("input:not([type=radio]):not([type=checkbox]), textarea");
      if (field) (e.target as HTMLElement).blur();
      else if (focus) setFocus?.(null);
      else router.push("/dashboard");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, setFocus, router]);

  if (show3D === false) {
    return (
      <div className="pointer-events-auto absolute inset-0 overflow-y-auto px-3 py-8">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold uppercase tracking-[0.25em] text-ink">Settings</h1>
            <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard")}>
              Back to the desk
            </Button>
          </div>
          {notes.map((n) => (
            <section key={n.name} aria-labelledby={`note-${n.name}`} className="rounded-md border-[3px] border-ink bg-paper p-5 text-sm">
              <h2 id={`note-${n.name}`} className="mb-4 text-lg font-semibold uppercase tracking-wide text-ink">
                {n.title}
              </h2>
              {n.content}
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <h1 className="sr-only">Settings</h1>
      {/* The board's BACK TO DESK tag, for the keyboard. */}
      <button
        type="button"
        onClick={() => router.push("/dashboard")}
        className="pointer-events-auto sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-20 focus:rounded-lg focus:border-2 focus:border-ink focus:bg-paper focus:px-3 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Back to the desk
      </button>
      {notes.map((n) => (
        <PinnedContent
          key={n.name}
          note={n}
          shown={atBoard && (focus === null || focus === n.name)}
          focused={focus === n.name}
          onOpen={() => setFocus?.(n.name)}
          onDone={() => setFocus?.(null)}
        />
      ))}
    </>
  );
}

function PinnedContent({
  note,
  shown,
  focused,
  onOpen,
  onDone,
}: {
  note: NoteContent;
  shown: boolean;
  focused: boolean;
  onOpen: () => void;
  onDone: () => void;
}) {
  const building = useBuilding();
  const setAnchor = building?.setAnchor;
  const [el, setEl] = useState<HTMLElement | null>(null);
  const writing = useRef<HTMLDivElement>(null);
  /** The latest fit, kept for when the writing (re)appears. */
  const fit = useRef<Fit>({ scale: 1, height: 0 });
  const [small, setSmall] = useState(false);

  // Pinned while mounted: the scene writes this element's place every frame.
  useEffect(() => {
    if (!el || !setAnchor) return;
    const name = `note:${note.name}`;
    setAnchor(name, el);
    return () => setAnchor(name, null);
  }, [el, setAnchor, note.name]);

  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width) return;
      fit.current = { scale: width / WRITING_WIDTH, height };
      applyFit(writing.current, fit.current);
      setSmall(fit.current.scale < MIN_SCALE);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  const open = small && !focused;

  return (
    <section
      ref={setEl}
      aria-label={note.title}
      inert={!shown}
      className={`absolute left-0 top-0 transition-opacity duration-300 ${shown ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
    >
      {/* Keyed apart, so the writing's inline scale doesn't carry over. */}
      {open ? (
        <div key="open" className="flex h-full items-center justify-center">
          <Button size="sm" onClick={onOpen}>
            Open this note
          </Button>
        </div>
      ) : (
        <div
          key="writing"
          ref={(box) => {
            writing.current = box;
            applyFit(box, fit.current);
          }}
          style={{ width: WRITING_WIDTH }}
          className="flex origin-top-left flex-col gap-3 overflow-y-auto overscroll-contain px-1 text-sm [scrollbar-width:thin]"
        >
          {note.content}
          {focused && (
            <Button variant="secondary" size="sm" onClick={onDone} className="self-start">
              Done
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
