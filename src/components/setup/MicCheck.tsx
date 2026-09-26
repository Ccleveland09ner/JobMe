"use client";

/**
 * Live mic level meter, so nobody finds out their mic is dead mid-interview.
 *
 * TODO(slice 3): implement.
 * Ref: docs/PRD-JobMe-MVP.md > Interview Setup
 *
 * getUserMedia + AnalyserNode -> a level bar.
 *
 * Denied permission: explain how to re-enable it AND offer "type answers
 * instead". Unsupported browser: "Best in Chrome or Edge" plus the same typed
 * fallback. Neither case is a dead end.
 */

export function MicCheck() {
  return <div className="text-sm text-muted">{/* TODO(slice 3) */}</div>;
}
