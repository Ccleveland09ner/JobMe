/**
 * The candidate's own words, wherever a page quotes them. Inline it is a <q>
 * (the browser prints the quote marks); as a block, a <blockquote> with them
 * printed. Each place keeps its own look through `className`.
 */

import type { ReactNode } from "react";

export function CandidateQuote({
  children,
  block = false,
  className,
}: {
  children: ReactNode;
  block?: boolean;
  className?: string;
}) {
  if (block) return <blockquote className={className}>&ldquo;{children}&rdquo;</blockquote>;
  return <q className={className}>{children}</q>;
}
