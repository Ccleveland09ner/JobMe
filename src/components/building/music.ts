/**
 * The lobby's background music, outside React: the playlist, where in the
 * building it plays, and hushes (something that needs quiet, like the
 * microphone test, holds one while it runs). LobbyMusic.tsx plays it
 * (through backgroundAudio.ts).
 */

import { useSyncExternalStore } from "react";

import type { Station } from "./stations";

export interface Track {
  src: string;
  title: string;
  artist: string;
}

/** Played in order, starting at a random track, round and round. */
export const LOBBY_TRACKS: readonly Track[] = [
  { src: "/audio/music/pufino-warm-place.mp3", title: "Warm Place", artist: "Pufino" },
  { src: "/audio/music/hazelwood-reflection.mp3", title: "Reflection", artist: "Hazelwood" },
  { src: "/audio/music/massobeats-peach-prosecco.mp3", title: "Peach Prosecco", artist: "massobeats" },
  { src: "/audio/music/lukrembo-branch.mp3", title: "Branch", artist: "Lukrembo" },
  { src: "/audio/music/massobeats-aromatic.mp3", title: "Aromatic", artist: "massobeats" },
];

/** Low: under the room, never over it. */
export const LOBBY_VOLUME = 0.16;

/** The lobby: the front desk, and the notice board on its back wall. */
const LOBBY: ReadonlySet<Station> = new Set(["desk", "noteboard"]);

/**
 * Whether the lobby's music should be playing: where the user is, or where
 * they are walking to, so it swells as they walk in and fades as they leave.
 */
export function wantsLobbyMusic(state: { station: Station; target: Station | null }): boolean {
  return LOBBY.has(state.target ?? state.station);
}

let hushes = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Quiet the music while something needs it; call the result to let it play again. */
export function hushMusic(): () => void {
  hushes++;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    hushes--;
    emit();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while anything holds a hush. */
export function isMusicHushed(): boolean {
  return hushes > 0;
}

export function useMusicHushed(): boolean {
  return useSyncExternalStore(subscribe, isMusicHushed, () => false);
}
