/** A small text label; the text carries the meaning, never colour alone. */

import type { HTMLAttributes } from "react";

import { SCORE_LEVEL_CLASSES } from "@/components/score/levels";

export type BadgeTone = "neutral" | "accent" | "danger" | "score-1" | "score-2" | "score-3" | "score-4";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-sunken text-ink",
  accent: "border-accent/30 bg-accent-soft text-accent-strong",
  danger: "border-danger/30 bg-danger-soft text-danger",
  "score-1": SCORE_LEVEL_CLASSES[1].badge,
  "score-2": SCORE_LEVEL_CLASSES[2].badge,
  "score-3": SCORE_LEVEL_CLASSES[3].badge,
  "score-4": SCORE_LEVEL_CLASSES[4].badge,
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
