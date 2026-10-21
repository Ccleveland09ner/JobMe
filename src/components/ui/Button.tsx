/**
 * The one button; buttonClasses() styles a <Link> the same way. Defaults to
 * type="button", so it never submits a form by accident.
 */

import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-medium " +
  "transition-[transform,box-shadow,background-color,border-color] duration-150 " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

/** Solid buttons are drawn objects (ink edge, paper grain, a lift on hover); ghost buttons are flat. */
const RAISED =
  "grain border-2 border-ink shadow-md " +
  "not-disabled:not-aria-disabled:hover:-translate-y-0.5 not-disabled:not-aria-disabled:hover:shadow-lg " +
  "not-disabled:not-aria-disabled:active:translate-y-0 not-disabled:not-aria-disabled:active:shadow-sm " +
  "motion-reduce:transform-none";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: `${RAISED} bg-accent text-white hover:bg-accent-strong`,
  secondary: `${RAISED} bg-surface text-ink hover:bg-sunken`,
  ghost: "border-2 border-transparent text-ink hover:border-ink/20 hover:bg-sunken",
  danger: `${RAISED} bg-danger text-white hover:brightness-95`,
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-2.5 text-base",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className = "",
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim();
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...rest} />;
}
