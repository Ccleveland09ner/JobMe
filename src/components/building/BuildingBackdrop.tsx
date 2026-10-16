"use client";

/**
 * Behind every page: the 3D building, or the illustrated one.
 *
 * The illustrated building is what the server renders, what shows before
 * hydration, what WebGL-less browsers keep, and what covers a lost WebGL
 * context — the same role the SVG recruiter plays for the 3D one. The
 * canvas stays mounted while its context is lost, so the browser can
 * restore it.
 */

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Component, type ReactNode } from "react";

import { HeroScene } from "@/components/landing/HeroScene";

import { useBuilding } from "./BuildingProvider";
import { stationForPath } from "./stations";

const BuildingCanvas = dynamic(() => import("./BuildingCanvas"), { ssr: false });

/**
 * A canvas that cannot start (a GPU blocklist, WebGL refused after the
 * feature check passed) or a scene that throws: show the illustrated
 * building, and stay that way for the visit.
 */
class CanvasErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[building] 3D unavailable, showing the illustrated building:", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function BuildingBackdrop() {
  const building = useBuilding();
  const pathname = usePathname();
  const show3D = building?.show3D ?? false;

  return (
    <div aria-hidden="true" className="fixed inset-0 z-0">
      {building?.webgl && (
        <div className={`absolute inset-0 ${show3D ? "" : "invisible"}`}>
          <CanvasErrorBoundary onError={() => building.dispatch({ type: "CONTEXT_LOST" })}>
            <BuildingCanvas />
          </CanvasErrorBoundary>
        </div>
      )}
      {!show3D &&
        (stationForPath(pathname) === "street" ? (
          <HeroScene />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-sunken to-bg" />
        ))}
    </div>
  );
}
