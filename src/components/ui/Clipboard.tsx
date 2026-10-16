/**
 * A clipboard: the object forms are filled in on, at the door (sign-in) and
 * at the front desk (interview setup). It stands on its own over the 3D
 * building — no panel behind it — and is drawn the way the building is:
 * flat toon shading in three tones, ink outlines on every edge, and solid
 * depth rather than soft blur.
 *
 *   - the board: hardboard with a bevelled lit/shaded rim and a thick
 *     extruded edge below it, sitting on a flat contact shadow;
 *   - the paper: a sheet with two more peeking out beneath it;
 *   - the clip: a shaded metal plate with rivets and a lever, casting a flat
 *     shadow on the paper it grips.
 * It drops in when it appears (not under reduced motion). The depth is CSS,
 * not WebGL: the fields stay real, sharp form controls.
 *
 * Fields on the paper are written on the line, not typed into a box: use
 * paperField / paperArea for their classes. Labels and semantics are the
 * ordinary ones; the clipboard is presentation only.
 */

import type { HTMLAttributes } from "react";

/** A one-line field: a ruled line to write on. */
export const paperField =
  "w-full border-0 border-b-2 border-ink/70 bg-transparent px-1 py-1.5 text-ink placeholder:text-muted/60 " +
  "transition-colors hover:border-ink focus:border-accent focus:bg-accent-soft/40";

/**
 * A multi-line field: ruled paper. The rule spacing matches the line height
 * (leading-7 = 1.75rem), so the text sits on the lines as it wraps.
 */
export const paperArea =
  "w-full rounded-sm border border-ink/30 bg-transparent px-2 py-0 leading-7 text-ink placeholder:text-muted/60 " +
  "bg-[linear-gradient(transparent_calc(1.75rem-1px),var(--color-rule)_calc(1.75rem-1px))] bg-size-[100%_1.75rem] bg-local " +
  "transition-colors hover:border-ink/60 focus:border-accent";

export interface ClipboardProps extends HTMLAttributes<HTMLDivElement> {
  /** Classes for the top sheet (layout of what is written on it). */
  paperClassName?: string;
}

/** Hard-edged toon bevel: a lit rim top-left, a shaded rim bottom-right. */
const BOARD_BEVEL =
  "shadow-[inset_5px_5px_0_0_var(--color-board-light),inset_-5px_-5px_0_0_var(--color-board-dark)]";

/** The board's thickness: an extruded edge, ink-outlined, below the face. */
const BOARD_EDGE = "shadow-[0_9px_0_-2px_var(--color-board-dark),0_9px_0_1px_var(--color-ink)]";

export function Clipboard({ className = "", paperClassName = "", children, ...rest }: ClipboardProps) {
  return (
    <div className={`clipboard-in relative pb-6 pt-10 ${className}`.trim()} {...rest}>
      {/* Flat contact shadow on whatever it rests against. */}
      <div aria-hidden="true" className="absolute inset-x-6 bottom-0 h-7 rounded-[50%] bg-ink/25" />

      {/* The board: extruded edge, then the face with its bevelled rim. */}
      <div className={`relative rounded-[1.4rem] border-[3px] border-ink bg-board ${BOARD_EDGE}`}>
        <div className={`rounded-[1.2rem] px-3 pb-4 pt-9 sm:px-4 sm:pb-5 ${BOARD_BEVEL}`}>
          {/* The clip, gripping the paper's top edge. */}
          <div aria-hidden="true" className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[45%]">
            <div className="relative h-12 w-36">
              {/* Lever arm, behind the plate. */}
              <div className="absolute left-1/2 top-0 h-5 w-20 -translate-x-1/2 rounded-t-full border-[3px] border-b-0 border-ink bg-[linear-gradient(var(--color-clipmetal-light)_0_45%,var(--color-clipmetal)_45%)]" />
              {/* Plate: three toon tones top to bottom, extruded lower lip. */}
              <div className="absolute inset-x-0 bottom-0 h-9 rounded-t-lg rounded-b-xl border-[3px] border-ink bg-[linear-gradient(var(--color-clipmetal-light)_0_30%,var(--color-clipmetal)_30%_72%,var(--color-clipmetal-shade)_72%)] shadow-[0_4px_0_-1px_var(--color-clipmetal-shade),0_4px_0_2px_var(--color-ink)]">
                <span className="absolute left-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-ink bg-clipmetal-light" />
                <span className="absolute right-3 top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-ink bg-clipmetal-light" />
              </div>
            </div>
            {/* Its flat shadow on the paper. */}
            <div className="absolute inset-x-3 -bottom-3 -z-10 h-4 rounded-b-lg bg-ink/20" />
          </div>

          {/* The paper: two sheets peeking out under the top one. */}
          <div className="relative">
            <div aria-hidden="true" className="absolute inset-0 translate-x-1.5 translate-y-2 rotate-[0.8deg] rounded-md border-2 border-ink/70 bg-paper-shade" />
            <div aria-hidden="true" className="absolute inset-0 -translate-x-1 translate-y-1 -rotate-[0.6deg] rounded-md border-2 border-ink/70 bg-paper" />
            <div
              className={`grain relative rounded-md border-2 border-ink bg-paper px-5 pb-6 pt-9 shadow-[inset_-3px_-3px_0_0_var(--color-paper-shade)] sm:px-6 ${paperClassName}`.trim()}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
