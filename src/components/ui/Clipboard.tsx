/**
 * A clipboard lit like the office: hardboard with its edge and shadow, a
 * brushed metal clip, paper in layers (globals.css .clip-*). CSS, not WebGL,
 * so its fields stay real form controls; use paperField and paperArea for
 * fields written on the paper.
 */

import type { HTMLAttributes, ReactNode } from "react";

/** A one-line field: a ruled line to write on. */
export const paperField =
  "w-full border-0 border-b-2 border-ink/70 bg-transparent px-1 py-1.5 text-ink placeholder:text-muted/60 " +
  "transition-colors hover:border-ink focus:border-accent focus:bg-accent-soft/40";

/** A multi-line field: ruled paper, spaced to the line height (leading-7). */
export const paperArea =
  "w-full rounded-sm border border-ink/30 bg-transparent px-2 py-0 leading-7 text-ink placeholder:text-muted/60 " +
  "bg-[linear-gradient(transparent_calc(1.75rem-1px),var(--color-rule)_calc(1.75rem-1px))] bg-size-[100%_1.75rem] bg-local " +
  "transition-colors hover:border-ink/60 focus:border-accent";

export interface ClipboardProps extends HTMLAttributes<HTMLDivElement> {
  /** Classes for the top sheet (layout of what is written on it). */
  paperClassName?: string;
  /** Being put down (a held clipboard closing): it leaves as it came. */
  closing?: boolean;
  /** Sheets of its own (BookSlider's clipboard mode) in place of the top sheet. */
  loose?: boolean;
  /** Placed against the board: a tag, say. */
  decoration?: ReactNode;
}

export function Clipboard({
  className = "",
  paperClassName = "",
  closing = false,
  loose = false,
  decoration,
  children,
  ...rest
}: ClipboardProps) {
  return (
    <div className={`${closing ? "held-out" : "clipboard-in"} relative pb-6 pt-10 ${className}`.trim()} {...rest}>
      {/* The board: its face lit, its edge below, its shadow on whatever is behind. */}
      <div className="clip-board relative rounded-[1.4rem]">
        <div className="px-3 pb-4 pt-9 sm:px-4 sm:pb-5">
          {/* The clip, gripping the paper's top edge. */}
          <div aria-hidden="true" className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[45%]">
            <div className="relative h-12 w-36">
              {/* Lever arm, behind the plate. */}
              <div className="clip-metal absolute left-1/2 top-0 h-5 w-20 -translate-x-1/2 rounded-t-full" />
              {/* Plate, riveted to the board, rolled into a hinge along its lower edge. */}
              <div className="clip-metal clip-plate absolute inset-x-0 bottom-0 h-9 rounded-t-lg rounded-b-xl">
                <span className="clip-rivet absolute left-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full" />
                <span className="clip-rivet absolute right-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full" />
              </div>
            </div>
          </div>

          {/* The paper: two sheets peeking out under the top one. */}
          <div className="relative">
            <div aria-hidden="true" className="clip-sheet clip-sheet--under absolute inset-0 translate-x-1.5 translate-y-2 rotate-[0.8deg] rounded-md" />
            <div aria-hidden="true" className="clip-sheet absolute inset-0 -translate-x-1 translate-y-1 -rotate-[0.6deg] rounded-md" />
            {loose ? (
              <div className="relative">{children}</div>
            ) : (
              <div className={`clip-paper relative rounded-md px-5 pb-6 pt-9 sm:px-6 ${paperClassName}`.trim()}>{children}</div>
            )}
          </div>
        </div>
      </div>
      {decoration}
    </div>
  );
}
