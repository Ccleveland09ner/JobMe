"use client";

/**
 * The DOM layer over the canvas: the route's content and the single <main>.
 * How a page sits over the scene depends on its layout (layoutFor). At the
 * desk the user clicks the 3D objects; hidden twin buttons serve the keyboard.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CLOSE_MS } from "@/components/held/useHeld";
import { buttonClasses } from "@/components/ui/Button";

import { useBuilding, useShow3D } from "./BuildingProvider";
import { domVisible, type Held } from "./heldMachine";
import { stationForPath } from "./stations";

type Layout = "overlay" | "clipboard" | "held" | "board" | "room" | "panel";

/** Routes whose page is a standalone clipboard, and its width. */
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

/** Tailwind's md breakpoint, where a panel moves to the side. */
const SIDE_PANEL_QUERY = "(min-width: 48rem)";

export function StationLayer({ children }: { children: ReactNode }) {
  const building = useBuilding();
  const show3D = useShow3D();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const main = useRef<HTMLElement>(null);
  const layout = layoutFor(pathname);
  const routeHeld = heldFor(pathname, search.get("open"));
  const walking = building !== null && building.state.target !== null && !building.state.returning;

  // Focus the page heading on route changes (not on first load).
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

  // The URL says what is held. In the room only the notepad can be.
  const dispatchHeld = building?.dispatchHeld;
  const heldNow = building?.held.held ?? null;
  useEffect(() => {
    if (layout !== "room") dispatchHeld?.({ type: "REQUEST", want: routeHeld });
    else if (heldNow !== null && heldNow !== "notepad") dispatchHeld?.({ type: "REQUEST", want: null });
  }, [dispatchHeld, layout, routeHeld, heldNow]);

  // A closing ends even if its page isn't shown here or never reports back.
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

  // Object actions, shared by the 3D objects and their twin buttons.
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

  // Keep the closing object's content after the route has moved on.
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
            {/* Auto margins, not flex centring, so tall content stays scrollable. */}
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
    // Click-through to the 3D board; only the pinned controls take the pointer.
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

/** Desk actions, in the order the objects sit. */
const DESK_ACTIONS: { name: string; label: string }[] = [
  { name: "ledger", label: "Open the ledger: your interview history and progress" },
  { name: "clipboard", label: "Pick up the clipboard: start an interview" },
  { name: "reports", label: "Open the reports folder: your interview reports" },
  { name: "settings", label: "Go to the settings notice board" },
];

/** Hidden buttons for the desk objects; focus lights up the object. Shown without 3D. */
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
