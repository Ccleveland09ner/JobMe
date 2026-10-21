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
 *   clipboard  sign-in, at the door: the clipboard stands on its own
 *   held       the front desk: nothing on screen but the office itself, until
 *              the user picks something up off the desk — the ledger
 *              (/dashboard?open=ledger), the setup clipboard
 *              (/interview/new) or the reports folder (/reports,
 *              /interview/[id]/report). The page IS that object;
 *              heldMachine.ts sequences picking it up, opening it, closing
 *              it and putting it down.
 *   board      the settings notice board: the page pins its controls onto
 *              the board's own notes (components/settings/BoardNotes.tsx)
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
 *
 * At the desk there are no web buttons: the user clicks the objects. Each
 * desk action keeps a twin <button> for the keyboard and screen readers,
 * visually hidden; focusing one points at its object, so the object and its
 * floating name light up in the scene as the focus indicator. Only when
 * there is no 3D building (no WebGL) do the twins show, as paper tags.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CLOSE_MS } from "@/components/held/useHeld";
import { buttonClasses } from "@/components/ui/Button";

import { useBuilding, useShow3D } from "./BuildingProvider";
import { domVisible, type Held } from "./heldMachine";
import { stationForPath } from "./stations";

type Layout = "overlay" | "clipboard" | "held" | "board" | "room" | "panel";

/** Routes whose whole page is a clipboard standing on its own, and how wide. */
const CLIPBOARD_PAGES: { match: (path: string) => boolean; width: string }[] = [
  { match: (p) => p.startsWith("/login"), width: "md:w-[27rem]" },
];

const REPORT_ROUTE = /^\/interview\/[^/]+\/report$/;

function layoutFor(pathname: string): Layout {
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
function heldFor(pathname: string, open: string | null): Held | null {
  if (pathname === "/dashboard") return open === "ledger" ? "ledger" : null;
  if (pathname === "/reports" || REPORT_ROUTE.test(pathname)) return "reports";
  if (pathname === "/interview/new") return "clipboard";
  return null;
}

/** Matches Tailwind's `md` breakpoint, where a panel moves to the side. */
const SIDE_PANEL_QUERY = "(min-width: 48rem)";

export function StationLayer({ children }: { children: ReactNode }) {
  const building = useBuilding();
  const show3D = useShow3D();
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

  // The URL says what should be in the user's hands. In the room only its
  // notepad can be held (the room asks for it); arriving there with a desk
  // object still in hand (the clipboard, after Begin) puts that down.
  const dispatchHeld = building?.dispatchHeld;
  const heldNow = building?.held.held ?? null;
  useEffect(() => {
    if (layout !== "room") dispatchHeld?.({ type: "REQUEST", want: routeHeld });
    else if (heldNow !== null && heldNow !== "notepad") dispatchHeld?.({ type: "REQUEST", want: null });
  }, [dispatchHeld, layout, routeHeld, heldNow]);

  // A held object closing whose page self is no longer on screen (the route
  // moved on to a layout that does not show it) cannot play its closing:
  // count it closed, so its 3D self can go back to where it rests. And
  // whatever happens to its page, a closing ends: if nothing has reported it
  // closed a little after its animation's length, it is closed.
  const heldPhase = building?.held.phase;
  const shownHere = layout === "held" ? heldNow !== "notepad" : layout === "room" ? heldNow === "notepad" : false;
  useEffect(() => {
    if (heldPhase !== "closing" || !dispatchHeld) return;
    if (!shownHere) {
      dispatchHeld({ type: "DOM_CLOSED" });
      return;
    }
    const timer = setTimeout(() => dispatchHeld({ type: "DOM_CLOSED" }), CLOSE_MS + 600);
    return () => clearTimeout(timer);
  }, [heldPhase, shownHere, dispatchHeld]);

  // What the office's objects do, shared by their 3D selves and their twins.
  const setAction = building?.setAction;
  useEffect(() => {
    if (!setAction) return;
    const actions: Record<string, string> = {
      ledger: "/dashboard?open=ledger",
      clipboard: "/interview/new",
      reports: "/reports",
      settings: "/settings",
      desk: "/dashboard",
    };
    for (const [name, href] of Object.entries(actions)) setAction(name, () => router.push(href));
    return () => {
      for (const name of Object.keys(actions)) setAction(name, null);
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
      <main id="main" ref={main} className={fade}>
        {showHeld ? (
          <div className="fixed inset-0 z-10 flex overflow-y-auto px-2 py-4 sm:px-6 sm:py-8">
            {/* Centred by auto margins, not flex alignment: something taller
                than the screen then starts at the top and scrolls, instead
                of overflowing above it out of reach. */}
            <div className="m-auto flex w-full justify-center">{content}</div>
          </div>
        ) : (
          <DeskTwins
            disabled={!resting}
            visible={show3D === false}
            onPoint={(name) => building?.setHovered(name)}
            onActivate={(name) => building?.activate(name)}
          />
        )}
      </main>
    );
  }

  const frame: Record<Exclude<Layout, "held">, string> = {
    overlay: "relative z-10 flex min-h-dvh flex-1 flex-col",
    clipboard: `fixed inset-x-0 bottom-0 z-10 max-h-[70vh] overflow-y-auto px-3 pt-4 [scrollbar-width:thin] md:inset-y-0 md:left-auto md:right-6 md:max-h-none md:px-2 md:py-6 ${CLIPBOARD_PAGES.find((c) => c.match(pathname))?.width ?? ""}`,
    // Click-through: the board itself is the 3D one; only the controls
    // pinned onto its notes take the pointer.
    board: "pointer-events-none fixed inset-0 z-10",
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

/** What can be done at the front desk, in the order the objects sit. */
const DESK_ACTIONS: { name: string; label: string }[] = [
  { name: "ledger", label: "Open the ledger: your interview history and progress" },
  { name: "clipboard", label: "Pick up the clipboard: start an interview" },
  { name: "reports", label: "Open the reports folder: your interview reports" },
  { name: "settings", label: "Go to the settings notice board" },
];

/**
 * The front desk with nothing in hand. The user clicks the objects in the
 * scene; these are their twins for the keyboard and screen readers —
 * visually hidden, and pointing at their object while focused, so the scene
 * shows where focus is. With no 3D building to click, they show, as tags.
 */
function DeskTwins({
  disabled,
  visible,
  onPoint,
  onActivate,
}: {
  disabled: boolean;
  visible: boolean;
  onPoint: (name: string | null) => void;
  onActivate: (name: string) => void;
}) {
  return (
    <div className={visible ? "fixed inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-5" : "sr-only"}>
      <h1 className="sr-only">Front desk</h1>
      <nav aria-label="On the front desk" className="flex flex-wrap justify-center gap-2">
        {DESK_ACTIONS.map((a) => (
          <button
            key={a.name}
            type="button"
            disabled={disabled}
            onFocus={() => onPoint(a.name)}
            onBlur={() => onPoint(null)}
            onClick={() => onActivate(a.name)}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            {a.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
