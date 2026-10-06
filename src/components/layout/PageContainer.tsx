/**
 * Page width and gutters. One place, so every screen lines up.
 *
 *   narrow - forms (setup, login)
 *   base   - reading pages (scorecard)
 *   wide   - dashboards and the interview room
 */

import type { HTMLAttributes } from "react";

const WIDTHS = {
  narrow: "max-w-xl",
  base: "max-w-3xl",
  wide: "max-w-6xl",
} as const;

export interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  width?: keyof typeof WIDTHS;
}

export function PageContainer({ width = "base", className = "", ...rest }: PageContainerProps) {
  return (
    <div
      className={`mx-auto w-full ${WIDTHS[width]} px-4 py-8 sm:px-6 sm:py-10 ${className}`.trim()}
      {...rest}
    />
  );
}

/** Standard page title row: heading, optional description, optional actions. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
