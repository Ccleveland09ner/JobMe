"use client";

/**
 * The street's sounds (sky/sounds.ts) on the landing page, quietly, at the
 * time of day's sound: they fade in as the user comes out to the street and
 * out as they walk to the door, and cross-fade when the time of day changes.
 * Quiet while the tab is hidden.
 */

import { useEffect } from "react";

import { BackgroundAudio, usePageVisible } from "./backgroundAudio";
import { useBuilding } from "./BuildingProvider";
import { STREET_SOUNDS, STREET_VOLUME, useStreetSound } from "./sky/sounds";

/** One player for the page, kept across routes. */
let player: BackgroundAudio | null = null;
const thePlayer = () => (player ??= new BackgroundAudio(STREET_VOLUME));

export function StreetSounds() {
  const building = useBuilding();
  const sound = useStreetSound();
  const visible = usePageVisible();
  const onStreet = building !== null && (building.state.target ?? building.state.station) === "street";
  const playing = onStreet && visible ? sound : null;

  useEffect(() => {
    thePlayer().play(playing ? [STREET_SOUNDS[playing]] : null);
  }, [playing]);
  // Leaving the building's pages: quiet.
  useEffect(() => () => thePlayer().play(null), []);

  return null;
}
