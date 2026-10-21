"use client";

/**
 * What the DOM layer (StationLayer) keeps in step with the route and the
 * building: where focus lands, what is held, where the desk objects go, what
 * a closing object shows, and how much of the screen the camera must avoid.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { CLOSE_MS } from "@/components/held/useHeld";

import { useBuilding } from "./BuildingProvider";
import type { Held } from "./heldMachine";
import type { Layout } from "./stationLayout";

/** Tailwind's md breakpoint, where a panel moves to the side. */
const SIDE_PANEL_QUERY = "(min-width: 48rem)";

/**
 * Focuses the page heading after a route change (not on first load), but not
 * when a held document only moved its URL along (the folder's tabs).
 */
export function useRouteHeadingFocus(main: RefObject<HTMLElement | null>, pathname: string, routeHeld: Held | null) {
  const shown = useRef({ pathname, held: routeHeld });
  useEffect(() => {
    const before = shown.current;
    if (before.pathname === pathname) return;
    shown.current = { pathname, held: routeHeld };
    if (routeHeld !== null && before.held === routeHeld) return;
    const heading = main.current?.querySelector("h1");
    if (heading instanceof HTMLElement) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [main, pathname, routeHeld]);
}

/**
 * Holds what the URL says is held (in the room only the notepad can be), and
 * ends a closing even if its page isn't shown here or never reports back.
 */
export function useHeldFromRoute(layout: Layout, routeHeld: Held | null) {
  const building = useBuilding();
  const dispatchHeld = building?.dispatchHeld;
  const heldNow = building?.held.held ?? null;
  useEffect(() => {
    if (layout !== "room") dispatchHeld?.({ type: "REQUEST", want: routeHeld });
    else if (heldNow !== null && heldNow !== "notepad") dispatchHeld?.({ type: "REQUEST", want: null });
  }, [dispatchHeld, layout, routeHeld, heldNow]);

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
}

/** Where each desk object leads, for the 3D objects and their twin buttons alike. */
const DESK_ROUTES: Record<string, string> = {
  ledger: "/dashboard?open=ledger",
  clipboard: "/interview/new",
  reports: "/reports",
  settings: "/settings",
  desk: "/dashboard",
};

export function useDeskActions() {
  const setAction = useBuilding()?.setAction;
  const router = useRouter();
  useEffect(() => {
    if (!setAction) return;
    for (const [name, href] of Object.entries(DESK_ROUTES)) setAction(name, () => router.push(href));
    return () => {
      for (const name of Object.keys(DESK_ROUTES)) setAction(name, null);
    };
  }, [setAction, router]);
}

/** The open object's page, kept to show while it closes after the route has moved on. */
export function useHeldContent(routeHeld: Held | null, children: ReactNode): ReactNode {
  const held = useBuilding()?.held;
  const [heldContent, setHeldContent] = useState<ReactNode>(null);
  if (held && held.phase === "open" && held.held === routeHeld && heldContent !== children) setHeldContent(children);
  return heldContent;
}

/** Tells the camera how much of the screen a panel or clipboard covers. */
export function useCameraInset(main: RefObject<HTMLElement | null>, measured: boolean) {
  const setInset = useBuilding()?.setInset;
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
  }, [main, setInset, measured]);
}
