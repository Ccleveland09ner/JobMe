/** A small text label; the text carries the meaning, never colour alone. */

import type { HTMLAttributes } from "react";

export type BadgeTone = "neutral" | "accent" | "danger" | "score-1" | "score-2" | "score-3" | "score-4";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-sunken text-ink",
  accent: "border-accent/30 bg-accent-soft text-accent-strong",
  danger: "border-danger/30 bg-danger-soft text-danger",
  "score-1": "border-score-1/30 bg-surface text-score-1",
  "score-2": "border-score-2/30 bg-surface text-score-2",
  "score-3": "border-score-3/30 bg-surface text-score-3",
  "score-4": "border-score-4/30 bg-surface text-score-4",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className = "", ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`.trim()}
      {...rest}
    />
  );
}
