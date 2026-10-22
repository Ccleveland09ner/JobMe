"use client";

/**
 * Behind every page: the 3D building, or the illustrated one (server render,
 * before hydration, no WebGL, or a lost context).
 */

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Component, type ReactNode } from "react";

import { HeroScene } from "@/components/landing/HeroScene";

import { useBuilding } from "./BuildingProvider";
import { stationForPath } from "./stations";

const BuildingCanvas = dynamic(() => import("./BuildingCanvas"), { ssr: false });

/** If the canvas can't start or the scene throws, keep the illustrated building. */
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
