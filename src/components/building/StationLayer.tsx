"use client";

/**
 * The page, in the building: the DOM layer over the canvas that holds the
 * route's content, the single <main> landmark, and the station's fixtures.
 *
 * Every page keeps its own headings, forms and order — the building is
 * presentation, not semantics. How a page sits over the scene depends on
 * what it is (layoutFor):
 *
 *   overlay    the street: the page sits straight over the scene
 *   clipboard  sign-in, interview setup: the clipboard stands on its own
 *   held       the front desk: nothing on screen but the desk, until the user
 *              picks something up — the ledger (/dashboard?open=ledger) or
 *              the reports folder (/reports, /interview/[id]/report). The
 *              page IS that object; heldMachine.ts sequences picking it up,
 *              opening it, closing it and putting it down.
 *   board      the settings notice board: the page lays its notes over it
 *   room       the interview room: the page lays its bubbles, microphone and
 *              notepad over the scene
 *   panel      anything else (development pages): a plain side panel
 *
 *   - On a route change, focus moves to the page's <h1>.
 *   - During a walk the page fades out (it is somewhere else now), and fades
 *     back when the walk arrives — or when a failed walk returns, so its
 *     error is in front of the user.
 *   - A side panel or clipboard reports its footprint to the camera
 *     (ViewInset), which frames the scene in the space that is left.
 */

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button, buttonClasses } from "@/components/ui/Button";

import { useBuilding } from "./BuildingProvider";
import { FixtureBar } from "./FixtureBar";
import { domVisible, type Held } from "./heldMachine";
import { stationForPath } from "./stations";

type Layout = "overlay" | "clipboard" | "held" | "board" | "room" | "panel";

/** Routes whose whole page is a clipboard, and how wide it stands. */
const CLIPBOARD_PAGES: { match: (path: string) => boolean; width: string }[] = [
  { match: (p) => p.startsWith("/login"), width: "md:w-[27rem]" },
  { match: (p) => p === "/interview/new", width: "md:w-[min(40rem,50vw)]" },
];

const REPORT_ROUTE = /^\/interview\/[^/]+\/report$/;

function layoutFor(pathname: string): Layout {
  if (CLIPBOARD_PAGES.some((c) => c.match(pathname))) return "clipboard";
  if (pathname.startsWith("/dev/")) return "panel";
  const station = stationForPath(pathname);
  if (station === "street") return "overlay";
  if (station === "noteboard") return "board";
  if (station === "room") return "room";
  if (pathname === "/dashboard" || pathname === "/reports" || REPORT_ROUTE.test(pathname)) return "held";
  return "panel";
}

/** The desk object a route asks to be holding. */
function heldFor(pathname: string, open: string | null): Held | null {
  if (pathname === "/dashboard") return open === "ledger" ? "ledger" : null;
  if (pathname === "/reports" || REPORT_ROUTE.test(pathname)) return "reports";
  return null;
}

/** Matches Tailwind's `md` breakpoint, where a panel moves to the side. */
const SIDE_PANEL_QUERY = "(min-width: 48rem)";

export function StationLayer({ children }: { children: ReactNode }) {
  const building = useBuilding();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const main = useRef<HTMLElement>(null);
  // The layout follows the route, not the camera: content and its frame
  // arrive together.
  const layout = layoutFor(pathname);
  const routeHeld = heldFor(pathname, search.get("open"));
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

  // The URL says what should be in the user's hands. The room manages its
  // own notepad; everywhere else, leaving a desk route puts things down.
  const dispatchHeld = building?.dispatchHeld;
  useEffect(() => {
    if (layout === "room") return;
    dispatchHeld?.({ type: "REQUEST", want: routeHeld });
  }, [dispatchHeld, layout, routeHeld]);

  // What the desk's objects do, shared by their 3D selves and their buttons.
  const setAction = building?.setAction;
  useEffect(() => {
    if (!setAction) return;
    setAction("ledger", () => router.push("/dashboard?open=ledger"));
    setAction("reports", () => router.push("/reports"));
    setAction("settings", () => router.push("/settings"));
    return () => {
      setAction("ledger", null);
      setAction("reports", null);
      setAction("settings", null);
    };
  }, [setAction, router]);

  // A held object keeps showing what it held while it closes, even though the
  // route (and so `children`) has already moved on to the next object.
  // (State adjusted during render, React's pattern for "remember the
  // previous value"; it settles in one extra render.)
  const held = building?.held;
  const [heldContent, setHeldContent] = useState<ReactNode>(null);
  if (held && held.phase === "open" && held.held === routeHeld && heldContent !== children) setHeldContent(children);

  // Tell the camera how much of the screen a panel or clipboard covers.
  const measured = layout === "panel" || layout === "clipboard";
  const setInset = building?.setInset;
  useEffect(() => {
    const el = main.current;
    if (!setInset || !el) return;
    const measure = () => {
      if (!measured) setInset({ right: 0, bottom: 0 });
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
  }, [setInset, measured]);

  const fade = `transition-opacity duration-300 ${walking ? "pointer-events-none opacity-0" : "opacity-100"}`;

  if (layout === "held") {
    // Without the building (no provider) the page simply renders.
    const showHeld = !building || (held !== undefined && domVisible(held) && held.held !== "notepad");
    const content = !building ? children : held?.phase === "closing" ? heldContent : children;
    const resting = !building || held?.phase === "resting";
    return (
      <>
        <FixtureBar />
        <main id="main" ref={main} className={fade}>
          {showHeld ? (
            <div className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto px-2 py-4 sm:items-center sm:px-6 sm:py-8">
              {content}
            </div>
          ) : (
            <DeskObjects disabled={!resting} onActivate={(name) => building?.activate(name)} />
          )}
        </main>
      </>
    );
  }

  const frame: Record<Exclude<Layout, "held">, string> = {
    overlay: "relative z-10 flex min-h-dvh flex-1 flex-col",
    clipboard: `fixed inset-x-0 bottom-0 z-10 max-h-[70vh] overflow-y-auto px-3 pt-4 [scrollbar-width:thin] md:inset-y-0 md:left-auto md:right-6 md:max-h-none md:px-2 md:py-6 ${CLIPBOARD_PAGES.find((c) => c.match(pathname))?.width ?? ""}`,
    board: "fixed inset-0 z-10 overflow-y-auto",
    room: "pointer-events-none fixed inset-0 z-10",
    panel:
      "fixed inset-x-0 bottom-0 z-10 max-h-[62vh] overflow-y-auto rounded-t-2xl border border-line bg-surface/95 shadow-xl backdrop-blur-sm md:inset-y-4 md:left-auto md:right-4 md:max-h-none md:w-[min(40rem,48vw)] md:rounded-2xl",
  };

  return (
    <main id="main" ref={main} className={`${frame[layout]} ${fade}`}>
      {children}
    </main>
  );
}

/**
 * The front desk with nothing in hand: the things on and around it, as
 * buttons. The same actions run when their 3D selves are clicked; these keep
 * every one of them reachable by keyboard, screen reader, and without WebGL.
 */
function DeskObjects({ disabled, onActivate }: { disabled: boolean; onActivate: (name: string) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-5">
      <div className="pointer-events-auto flex flex-col items-center gap-3">
        <h1 className="sr-only">Front desk</h1>
        <nav aria-label="On the front desk" className="flex flex-wrap justify-center gap-2">
          <Link href="/interview/new" className={buttonClasses()} aria-disabled={disabled || undefined}>
            Start an interview
          </Link>
          <Button variant="secondary" disabled={disabled} onClick={() => onActivate("ledger")}>
            Open your ledger
          </Button>
          <Button variant="secondary" disabled={disabled} onClick={() => onActivate("reports")}>
            Open the reports folder
          </Button>
          <Button variant="secondary" disabled={disabled} onClick={() => onActivate("settings")}>
            Settings board
          </Button>
        </nav>
      </div>
    </div>
  );
}
