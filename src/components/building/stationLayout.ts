/**
 * How a route sits in the building (pure): the DOM layout its page takes over
 * the scene, and the desk object it asks to be holding.
 */

import type { Held } from "./heldMachine";
import { stationForPath } from "./stations";

export type Layout = "overlay" | "clipboard" | "held" | "board" | "room" | "panel";

/** Routes whose page is a standalone clipboard, and its width. */
const CLIPBOARD_PAGES: { match: (path: string) => boolean; width: string }[] = [
  { match: (p) => p.startsWith("/login"), width: "md:w-[27rem]" },
];

const REPORT_ROUTE = /^\/interview\/[^/]+\/report$/;

export function layoutFor(pathname: string): Layout {
  if (CLIPBOARD_PAGES.some((c) => c.match(pathname))) return "clipboard";
  if (pathname.startsWith("/dev/")) return "panel";
  const station = stationForPath(pathname);
  if (station === "street") return "overlay";
  if (station === "noteboard") return "board";
  if (station === "room") return "room";
  if (pathname === "/dashboard" || pathname === "/reports" || pathname === "/interview/new" || REPORT_ROUTE.test(pathname))
    return "held";
  return "panel";
}

/** The desk object a route asks to be holding. */
export function heldFor(pathname: string, open: string | null): Held | null {
  if (pathname === "/dashboard") return open === "ledger" ? "ledger" : null;
  if (pathname === "/reports" || REPORT_ROUTE.test(pathname)) return "reports";
  if (pathname === "/interview/new") return "clipboard";
  return null;
}

/** The width class of a standalone clipboard page; empty for any other. */
export function clipboardWidth(pathname: string): string {
  return CLIPBOARD_PAGES.find((c) => c.match(pathname))?.width ?? "";
}
