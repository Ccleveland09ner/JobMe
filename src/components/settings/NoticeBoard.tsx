"use client";

/**
 * The settings, as the notice board on the lobby wall (/settings).
 *
 * The camera has turned to the board (the "noteboard" station); this lays
 * the board's notes over it as real controls. Each note is pinned at a slight
 * angle; picking one unpins it — it straightens and comes forward to readable
 * size — and "Pin it back" returns it. One note is in hand at a time.
 *
 * The board fades in after the camera has had time to turn (BOARD_DELAY_MS),
 * so the user sees the pan before the notes; under reduced motion the camera
 * cuts and the notes appear at once.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";

export interface BoardNote {
  id: string;
  title: string;
  /** What the note says while pinned: a line or two of summary. */
  summary: ReactNode;
  content: ReactNode;
  tint: "paper" | "yellow";
  tilt: number;
}

const TINT = { paper: "bg-paper", yellow: "bg-note-yellow" } as const;

export function NoticeBoard({ notes }: { notes: BoardNote[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const note = notes.find((n) => n.id === open) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      if (open) setOpen(null);
      else router.push("/dashboard");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, router]);

  return (
    <div className="board-in flex min-h-dvh items-center justify-center px-3 py-6 sm:px-6">
      {/* Wide enough to cover the 3D board behind it, so it reads as that board. */}
      <section aria-labelledby="board-title" className="relative w-full max-w-[min(96vw,84rem)] pb-6">
        <div aria-hidden="true" className="absolute -bottom-1 inset-x-10 h-7 rounded-[50%] bg-ink/25" />
        {/* The board: a wooden frame round the cork. */}
        <div className="relative rounded-2xl border-[3px] border-ink bg-wood p-3 shadow-[inset_4px_4px_0_0_var(--color-wood-light),inset_-4px_-4px_0_0_var(--color-wood-dark),0_9px_0_-2px_var(--color-wood-dark),0_9px_0_1px_var(--color-ink)] sm:p-4">
          {/* The header plank. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border-[3px] border-ink bg-paper px-4 py-2">
            <h1 id="board-title" className="text-2xl font-bold uppercase tracking-[0.25em] text-ink">
              Settings
            </h1>
            <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard")}>
              Back to the desk
            </Button>
          </div>

          {/* The cork, with its notes. */}
          <div className="relative min-h-[min(62vh,34rem)] rounded-lg border-[3px] border-ink bg-cork p-5 shadow-[inset_0_4px_0_0_rgb(28_27_26/0.15)] sm:p-8">
            {note ? (
              <article
                aria-labelledby={`${note.id}-title`}
                className={`note-unpin grain relative mx-auto max-w-2xl rounded-md border-[3px] border-ink ${TINT[note.tint]} px-5 pb-6 pt-8 shadow-[6px_8px_0_0_rgb(28_27_26/0.25)] sm:px-7`}
              >
                <span aria-hidden="true" className="absolute left-1/2 top-2 size-4 -translate-x-1/2 rounded-full border-2 border-ink bg-pin" />
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <h2 id={`${note.id}-title`} className="text-xl font-semibold text-ink">
                    {note.title}
                  </h2>
                  <Button variant="secondary" size="sm" onClick={() => setOpen(null)}>
                    Pin it back
                  </Button>
                </div>
                {note.content}
              </article>
            ) : (
              <ul className="flex flex-wrap items-start justify-center gap-8">
                {notes.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(n.id)}
                      style={{ transform: `rotate(${n.tilt}deg)` }}
                      className={`group grain relative flex w-60 flex-col gap-2 rounded-md border-[3px] border-ink ${TINT[n.tint]} px-5 pb-5 pt-8 text-left shadow-[5px_7px_0_0_rgb(28_27_26/0.25)] transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[7px_11px_0_0_rgb(28_27_26/0.25)] motion-reduce:transition-none`}
                    >
                      <span aria-hidden="true" className="absolute left-1/2 top-2 size-4 -translate-x-1/2 rounded-full border-2 border-ink bg-pin" />
                      <span className="text-lg font-semibold text-ink">{n.title}</span>
                      <span className="text-sm text-muted">{n.summary}</span>
                      <span className="mt-1 text-xs font-semibold uppercase tracking-wider text-accent-strong group-hover:underline">
                        Unpin to change
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
