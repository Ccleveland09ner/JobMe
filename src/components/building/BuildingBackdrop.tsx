"use client";

/**
 * Behind every page: the 3D building, or a plain backdrop (server render,
 * before hydration, no WebGL, or a lost context).
 */

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";

import { useBuilding } from "./BuildingProvider";

const BuildingCanvas = dynamic(() => import("./BuildingCanvas"), { ssr: false });

/** If the canvas can't start or the scene throws, keep the plain backdrop. */
class CanvasErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[building] 3D unavailable, showing the plain backdrop:", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function BuildingBackdrop() {
  const building = useBuilding();
  const show3D = building?.show3D ?? false;
  // While a document is open in the user's hands, the office behind it goes out of focus.
  const reading = building?.held.phase === "open";

  return (
    <div aria-hidden="true" className="fixed inset-0 z-0">
      {building?.webgl && (
        <div className={`absolute inset-0 transition-[filter] duration-500 ${show3D ? "" : "invisible"} ${reading ? "blur-[3px] brightness-90" : ""}`}>
          <CanvasErrorBoundary onError={() => building.dispatch({ type: "CONTEXT_LOST" })}>
            <BuildingCanvas />
          </CanvasErrorBoundary>
        </div>
      )}
      {!show3D && <div className="absolute inset-0 bg-gradient-to-b from-sunken to-bg" />}
    </div>
  );
}
