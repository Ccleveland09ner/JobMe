"use client";

/**
 * Plays the lobby's music (music.ts) quietly while the user is in the lobby:
 * it fades in as they walk in and out as they leave. It stays quiet when
 * turned off on the settings board, while something holds a hush (the
 * microphone test) and while the tab is hidden.
 */

import { useEffect } from "react";

import { useLobbyMusic } from "@/lib/frontend/preferences";

import { BackgroundAudio, usePageVisible } from "./backgroundAudio";
import { useBuilding } from "./BuildingProvider";
import { LOBBY_TRACKS, LOBBY_VOLUME, useMusicHushed, wantsLobbyMusic } from "./music";

const SOURCES = LOBBY_TRACKS.map((t) => t.src);

/** One player for the page, kept across routes. */
let player: BackgroundAudio | null = null;
const thePlayer = () => (player ??= new BackgroundAudio(LOBBY_VOLUME));

export function LobbyMusic() {
  const building = useBuilding();
  const on = useLobbyMusic();
  const hushed = useMusicHushed();
  const visible = usePageVisible();
  const wanted = building !== null && on && !hushed && visible && wantsLobbyMusic(building.state);

  useEffect(() => {
    thePlayer().play(wanted ? SOURCES : null);
  }, [wanted]);
  // Leaving the building's pages: quiet.
  useEffect(() => () => thePlayer().play(null), []);

  return null;
}
