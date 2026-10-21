"use client";

/**
 * The building's state, shared by the 3D scene and the pages. Outside the
 * (building) route group useBuilding() returns null.
 */

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";

import type { Speaker } from "@/components/room/Recruiter3D";
import { webglAvailable } from "@/lib/frontend/webgl";

import { buildingReducer, initialBuilding, type BuildingEvent, type BuildingState } from "./buildingMachine";
import { heldReducer, initialHeld, type HeldEvent, type HeldState } from "./heldMachine";
import { stationForPath, type Station } from "./stations";

/** Screen space the page panel covers, so the camera can frame around it. */
export interface ViewInset {
  right: number;
  bottom: number;
}

export interface Building {
  state: BuildingState;
  /** The browser can draw WebGL at all: keep a canvas mounted. */
  webgl: boolean;
  /** WebGL is usable and has not been lost: show the 3D building. */
  show3D: boolean;
  dispatch: (event: BuildingEvent) => void;
  walkTo: (to: Station, options?: { hold?: boolean }) => void;
  release: () => void;
  fail: (message: string) => void;
  /** The interviewer's face, read every frame by the scene. */
  speaker: RefObject<Speaker>;
  /** Sets the speaker without re-rendering the scene. */
  setSpeaker: (speaker: Speaker) => void;
  /** Read every frame by the camera. */
  inset: RefObject<ViewInset>;
  setInset: (inset: ViewInset) => void;
  /** CameraRig registers how to request a frame (on-demand rendering). */
  setRedraw: (redraw: () => void) => void;

  /** What the user is holding (heldMachine.ts). */
  held: HeldState;
  dispatchHeld: (event: HeldEvent) => void;
  /** Named object actions; the 3D object and its DOM twin run the same one. */
  setAction: (name: string, run: (() => void) | null) => void;
  activate: (name: string) => void;
  hasAction: (name: string) => boolean;
  /** True while the camera is travelling; objects wait for it to settle. */
  cameraMoving: RefObject<boolean>;
  /** The station the camera is resting at, or null while it moves. */
  cameraAt: Station | null;
  setCameraAt: (at: Station | null) => void;

  /** What the user is pointing at, by action name (pointer or keyboard focus). */
  hovered: string | null;
  setHovered: (name: string | null) => void;

  /** DOM elements the scene pins onto 3D rectangles each frame (ScreenAnchor). */
  anchors: RefObject<Map<string, HTMLElement>>;
  setAnchor: (name: string, el: HTMLElement | null) => void;

  /** A close-up at the current station (a note on the board), or null. */
  focus: string | null;
  setFocus: (name: string | null) => void;
}

const BuildingContext = createContext<Building | null>(null);

export function useBuilding(): Building | null {
  return useContext(BuildingContext);
}

const noSubscribe = () => () => {};

/** Whether the 3D building shows; null until hydrated, so late-hydrating pages match the server HTML. */
export function useShow3D(): boolean | null {
  const building = useContext(BuildingContext);
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  return hydrated ? (building?.show3D ?? false) : null;
}

export function BuildingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, dispatch] = useReducer(buildingReducer, pathname, (p) => initialBuilding(stationForPath(p)));
  // false on the server and before hydration.
  const canUseWebGL = useSyncExternalStore(noSubscribe, webglAvailable, () => false);

  const speaker = useRef<Speaker>({ state: "idle" });
  const inset = useRef<ViewInset>({ right: 0, bottom: 0 });
  const redraw = useRef<() => void>(() => {});
  const setSpeaker = useCallback((s: Speaker) => {
    speaker.current = s;
  }, []);
  const setInset = useCallback((i: ViewInset) => {
    inset.current = i;
    redraw.current();
  }, []);
  const setRedraw = useCallback((r: () => void) => {
    redraw.current = r;
  }, []);

  const [held, dispatchHeld] = useReducer(heldReducer, undefined, initialHeld);
  const actions = useRef(new Map<string, () => void>());
  const setAction = useCallback((name: string, run: (() => void) | null) => {
    if (run) actions.current.set(name, run);
    else actions.current.delete(name);
  }, []);
  const activate = useCallback((name: string) => actions.current.get(name)?.(), []);
  const hasAction = useCallback((name: string) => actions.current.has(name), []);
  const cameraMoving = useRef(false);
  // The camera starts at rest at the first route's station (CameraRig).
  const [cameraAt, setCameraAtState] = useState<Station | null>(() => stationForPath(pathname));
  const setCameraAt = useCallback((at: Station | null) => {
    cameraMoving.current = at === null;
    setCameraAtState(at);
  }, []);

  // Keyed by path, so navigation clears them.
  const [pointing, setPointing] = useState<{ path: string; name: string | null }>({ path: pathname, name: null });
  const hovered = pointing.path === pathname ? pointing.name : null;
  const setHovered = useCallback((name: string | null) => setPointing({ path: window.location.pathname, name }), []);
  const [closeUp, setCloseUp] = useState<{ path: string; name: string | null }>({ path: pathname, name: null });
  const focus = closeUp.path === pathname ? closeUp.name : null;
  const setFocus = useCallback((name: string | null) => setCloseUp({ path: window.location.pathname, name }), []);

  const anchors = useRef(new Map<string, HTMLElement>());
  const setAnchor = useCallback((name: string, el: HTMLElement | null) => {
    if (el) anchors.current.set(name, el);
    else anchors.current.delete(name);
    redraw.current();
  }, []);

  useEffect(() => {
    dispatch({ type: "ROUTE", station: stationForPath(pathname) });
  }, [pathname]);

  const walkTo = useCallback((to: Station, options?: { hold?: boolean }) => {
    dispatch({ type: "WALK", to, hold: options?.hold ?? false });
  }, []);
  const release = useCallback(() => dispatch({ type: "RELEASE" }), []);
  const fail = useCallback((message: string) => dispatch({ type: "FAIL", message }), []);

  const show3D = canUseWebGL && state.render === "3d";

  // No 3D objects to animate: the lift and the return happen at once.
  useEffect(() => {
    if (show3D) return;
    if (held.phase === "lifting") dispatchHeld({ type: "LIFTED" });
    else if (held.phase === "returning") dispatchHeld({ type: "RETURNED" });
  }, [show3D, held.phase]);

  const value = useMemo<Building>(
    () => ({
      state,
      webgl: canUseWebGL,
      show3D,
      dispatch,
      walkTo,
      release,
      fail,
      speaker,
      setSpeaker,
      inset,
      setInset,
      setRedraw,
      held,
      dispatchHeld,
      setAction,
      activate,
      hasAction,
      cameraMoving,
      cameraAt,
      setCameraAt,
      hovered,
      setHovered,
      anchors,
      setAnchor,
      focus,
      setFocus,
    }),
    [
      state,
      canUseWebGL,
      show3D,
      walkTo,
      release,
      fail,
      setSpeaker,
      setInset,
      setRedraw,
      held,
      setAction,
      activate,
      hasAction,
      cameraAt,
      setCameraAt,
      hovered,
      setHovered,
      setAnchor,
      focus,
      setFocus,
    ],
  );

  return <BuildingContext.Provider value={value}>{children}</BuildingContext.Provider>;
}
