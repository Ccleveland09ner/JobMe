"use client";

/**
 * Ms. Crystal's speech bubble: exactly what she is saying, the words appearing
 * as she says them (all at once with reduced motion), pinned beside her head
 * (BubbleAnchor). It pops in as she starts, fades once she has finished, and
 * tells the controller when it has gone, which is what lets the music back in.
 * Screen readers get the whole line once.
 */

import { useCallback, useEffect, useState } from "react";

import { useBuilding } from "@/components/building/BuildingProvider";
import { prefersReducedMotion } from "@/lib/frontend/motion";

import { BUBBLE_ANCHOR, TAIL_TIP } from "./BubbleAnchor";
import { revealedChars } from "./clips";
import { useReceptionist } from "./ReceptionistProvider";

export function ReceptionistBubble() {
  const receptionist = useReceptionist();
  const dialogue = receptionist?.dialogue;
  const shown = dialogue && (dialogue.phase === "speaking" || dialogue.phase === "finishing") && dialogue.line;
  if (!receptionist || !shown || !dialogue.line) return null;
  return <Bubble key={dialogue.id} id={dialogue.id} text={dialogue.line.text} />;
}

function Bubble({ id, text }: { id: number; text: string }) {
  const building = useBuilding();
  const receptionist = useReceptionist()!;
  const { dialogue, timeline, now, bubbleGone } = receptionist;
  const finishing = dialogue.phase === "finishing";

  // Pinned by the scene each frame.
  const setAnchor = building?.setAnchor;
  const pin = useCallback((el: HTMLDivElement | null) => setAnchor?.(BUBBLE_ANCHOR, el), [setAnchor]);

  // The words so far, by her recorded timings; all of them once she's done.
  const [reduced] = useState(prefersReducedMotion);
  const [shownChars, setShownChars] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (reduced || finishing || !timeline) return;
    let frame = 0;
    const tick = () => {
      setShownChars(revealedChars(timeline, now()));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, finishing, timeline, now]);
  const revealed = finishing ? text.length : shownChars;

  const exit = dialogue.cut ? "reception-bubble-cut" : "reception-bubble-out";
  return (
    <>
      <div ref={pin} className="pointer-events-none fixed left-0 top-0 z-[5] w-[min(17rem,calc(100vw-2rem))]" style={{ visibility: "hidden" }}>
        <div
          className={`relative rounded-[1.5rem] border-[3px] border-ink bg-gradient-to-b from-[#fffdf8] to-paper px-4 pb-3 pt-2.5 shadow-[0_14px_28px_-10px_rgb(28_27_26/0.45),4px_6px_0_0_rgb(28_27_26/0.16),inset_0_2px_0_rgb(255_255_255/0.85)] ${
            finishing ? exit : "reception-bubble-in"
          } origin-bottom-right`}
          onAnimationEnd={(e) => {
            if (finishing && e.target === e.currentTarget) bubbleGone(id);
          }}
        >
          <p aria-hidden="true" className="mb-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">
            Ms. Crystal
          </p>
          {/* The unsaid words are laid out but unseen, so the bubble never changes size. */}
          <p aria-hidden="true" className="text-[0.95rem] leading-snug text-ink">
            {text.slice(0, revealed)}
            <span className="opacity-0">{text.slice(revealed)}</span>
          </p>
          {/* The tail, toward her: a corner of paper, ink on its two outer sides. */}
          <span
            aria-hidden="true"
            className="absolute -bottom-[12px] size-5 rotate-45 border-b-[3px] border-r-[3px] border-ink bg-paper"
            // Its tip (the square's centre line) where BubbleAnchor says she is.
            style={{ right: `calc(var(--tail-from-right, ${TAIL_TIP.fromRight}px) - 10px)` }}
          />
        </div>
      </div>
      <p role="status" className="sr-only">
        Ms. Crystal says: {text}
      </p>
    </>
  );
}
