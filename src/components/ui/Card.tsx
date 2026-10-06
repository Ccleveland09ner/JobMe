/**
 * A bordered surface. `as` keeps the semantics right — a card that is a page
 * section should be a <section> with a heading, not an anonymous <div>.
 */

import type { HTMLAttributes } from "react";

type CardElement = "div" | "section" | "article" | "aside";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: CardElement;
  padded?: boolean;
}

export function Card({ as: Tag = "div", padded = true, className = "", ...rest }: CardProps) {
  return (
    <Tag
      className={`rounded-xl border border-line bg-surface ${padded ? "p-5" : ""} ${className}`.trim()}
      {...rest}
    />
  );
}
