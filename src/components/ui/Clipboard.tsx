/**
 * Paper on a clipboard: the container for forms the user fills in at the
 * door (sign-in) and at the front desk (interview setup). A hardboard back
 * with an ink edge, a metal clip at the top, and a sheet of paper on it — the
 * same drawn, ink-outlined look as the 3D building behind it.
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
  /** Classes for the paper sheet (layout of what is written on it). */
  paperClassName?: string;
}

export function Clipboard({ className = "", paperClassName = "", children, ...rest }: ClipboardProps) {
  return (
    <div
      className={`relative rounded-2xl border-2 border-ink bg-board px-2.5 pb-3 pt-8 shadow-lg sm:px-3.5 sm:pb-4 ${className}`.trim()}
      {...rest}
    >
      {/* The clip: a metal plate riveted to the board, with the bar that grips the paper. */}
      <div aria-hidden="true" className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/3">
        <div className="relative h-10 w-32 rounded-t-xl rounded-b-md border-2 border-ink bg-clipmetal shadow-md">
          <div className="absolute left-1/2 top-1.5 h-3 w-8 -translate-x-1/2 rounded-full border-2 border-ink bg-board" />
          <div className="absolute inset-x-2 bottom-1.5 h-2 rounded-full border-2 border-ink bg-clipmetal-shade" />
        </div>
      </div>

      <div
        className={`grain relative rounded-md border-2 border-ink/80 bg-paper px-5 pb-6 pt-8 shadow-sm sm:px-6 ${paperClassName}`.trim()}
      >
        {children}
      </div>
    </div>
  );
}
