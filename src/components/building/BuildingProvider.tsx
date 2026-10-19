"use client";

/**
 * The building's state, shared by the 3D scene and the pages inside it.
 *
 * Pages tell the building where the user is going (walkTo) and when the
 * request a walk is covering has finished (release / fail). The scene reads
 * where the camera should be. Neither knows anything about the other's
 * internals — see buildingMachine.ts.
 *
 * Outside the (building) route group there is no provider, and
 * useBuilding() returns null: every caller treats that as "no building",
 * so the same components work in both places.
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
  /** The room drives the interviewer through this, without re-rendering the scene. */
  setSpeaker: (speaker: Speaker) => void;
  /** Read every frame by the camera. */
  inset: RefObject<ViewInset>;
  setInset: (inset: ViewInset) => void;
  /** The canvas renders on demand; CameraRig registers how to ask it for a frame. */
  setRedraw: (redraw: () => void) => void;

  /** What the user is holding (heldMachine.ts), and how to change it. */
  held: HeldState;
  dispatchHeld: (event: HeldEvent) => void;
  /**
   * Things the user can do with an object, by name ("ledger", "reports",
   * "settings", "notepad"). The page registers them; a click on the 3D object
   * and a click on its DOM twin run the same one.
   */
  setAction: (name: string, run: (() => void) | null) => void;
  activate: (name: string) => void;
  hasAction: (name: string) => boolean;
  /** True while the camera is travelling; objects wait for it to settle. */
  cameraMoving: RefObject<boolean>;
  setCameraMoving: (moving: boolean) => void;
}

const BuildingContext = createContext<Building | null>(null);

export function useBuilding(): Building | null {
  return useContext(BuildingContext);
}

const noSubscribe = () => () => {};

export function BuildingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, dispatch] = useReducer(buildingReducer, pathname, (p) => initialBuilding(stationForPath(p)));
  // false on the server and before hydration: the illustrated building renders first.
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
  const setCameraMoving = useCallback((moving: boolean) => {
    cameraMoving.current = moving;
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
      setCameraMoving,
    }),
    [state, canUseWebGL, show3D, walkTo, release, fail, setSpeaker, setInset, setRedraw, held, setAction, activate, hasAction, setCameraMoving],
  );

  return <BuildingContext.Provider value={value}>{children}</BuildingContext.Provider>;
}
