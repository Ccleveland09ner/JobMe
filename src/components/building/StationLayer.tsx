"use client";

/**
 * The page, in the building: the DOM layer over the canvas that holds the
 * route's content, the single <main> landmark, and the station's fixtures.
 *
 * Every page keeps its own headings, forms and order — the building is
 * presentation, not semantics. On wide screens the page is a panel to the
 * right of the scene; on narrow ones a bottom sheet. The street has no panel:
 * its page sits straight over the scene. Pages that are a clipboard (sign-in,
 * interview setup) have no panel either: the clipboard is the object, and it
 * stands on its own over the scene in the same place a panel would be.
 *
 *   - On a route change, focus moves to the page's <h1>.
 *   - During a walk the panel fades out (it is somewhere else now), and fades
 *     back when the walk arrives — or when a failed walk returns, so its
 *     error is in front of the user.
 *   - The panel's footprint is reported to the camera (ViewInset), which
 *     frames the scene in the space that is left.
 */

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { useBuilding } from "./BuildingProvider";
import { FixtureBar } from "./FixtureBar";
import { stationForPath, type Station } from "./stations";

const PANEL_WIDTH: Record<Exclude<Station, "street" | "corridor">, string> = {
  entrance: "md:w-[26rem]",
  desk: "md:w-[min(46rem,54vw)]",
  room: "md:w-[min(40rem,48vw)]",
};

/** Routes whose whole page is a clipboard, and how wide it stands. */
const CLIPBOARD_PAGES: { match: (path: string) => boolean; width: string }[] = [
  { match: (p) => p.startsWith("/login"), width: "md:w-[27rem]" },
  { match: (p) => p === "/interview/new", width: "md:w-[min(40rem,50vw)]" },
];

/** Matches Tailwind's `md` breakpoint, where the panel moves to the side. */
const SIDE_PANEL_QUERY = "(min-width: 48rem)";

export function StationLayer({ children }: { children: ReactNode }) {
  const building = useBuilding();
  const pathname = usePathname();
  const main = useRef<HTMLElement>(null);
  // The panel follows the route, not the camera: content and its layout
  // arrive together.
  const station = stationForPath(pathname);
  const panelled = station !== "street" && station !== "corridor";
  const walking = building !== null && building.state.target !== null && !building.state.returning;

  // Focus the page heading on every route change — not on first load,
  // where focus belongs to the browser.
  const shown = useRef(pathname);
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    const heading = main.current?.querySelector("h1");
    if (heading instanceof HTMLElement) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [pathname]);

  // Tell the camera how much of the screen the panel covers.
  const setInset = building?.setInset;
  useEffect(() => {
    const el = main.current;
    if (!setInset || !el) return;
    const measure = () => {
      if (!panelled) setInset({ right: 0, bottom: 0 });
      else if (window.matchMedia(SIDE_PANEL_QUERY).matches)
        setInset({ right: Math.max(0, window.innerWidth - el.getBoundingClientRect().left), bottom: 0 });
      else setInset({ right: 0, bottom: Math.max(0, window.innerHeight - el.getBoundingClientRect().top) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [setInset, panelled]);

  const clipboard = CLIPBOARD_PAGES.find((c) => c.match(pathname));
  const panel = clipboard
    ? `fixed inset-x-0 bottom-0 z-10 max-h-[70vh] overflow-y-auto px-3 pt-4 [scrollbar-width:thin] md:inset-y-0 md:left-auto md:right-6 md:max-h-none md:px-2 md:py-6 ${clipboard.width}`
    : panelled
      ? `fixed inset-x-0 bottom-0 z-10 max-h-[62vh] overflow-y-auto rounded-t-2xl border border-line bg-surface/95 shadow-xl backdrop-blur-sm md:inset-y-4 md:left-auto md:right-4 md:max-h-none md:rounded-2xl ${PANEL_WIDTH[station]}`
      : "relative z-10 flex min-h-dvh flex-1 flex-col";

  return (
    <>
      {station === "desk" && <FixtureBar />}
      <main
        id="main"
        ref={main}
        className={`${panel} transition-opacity duration-300 ${walking ? "pointer-events-none opacity-0" : "opacity-100"}`}
      >
        {children}
      </main>
    </>
  );
}
