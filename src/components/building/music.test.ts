import { describe, expect, it } from "vitest";

import { hushMusic, isMusicHushed, LOBBY_TRACKS, nextTrack, wantsLobbyMusic } from "./music";
import type { Station } from "./stations";

const STATIONS: Station[] = ["street", "entrance", "desk", "noteboard", "corridor", "room"];

describe("wantsLobbyMusic", () => {
  it("plays at the front desk and the notice board, and nowhere else", () => {
    const playing = STATIONS.filter((station) => wantsLobbyMusic({ station, target: null }));
    expect(playing).toEqual(["desk", "noteboard"]);
  });

  it("follows where the user is walking: in as they enter, out as they leave", () => {
    expect(wantsLobbyMusic({ station: "entrance", target: "desk" })).toBe(true);
    expect(wantsLobbyMusic({ station: "desk", target: "noteboard" })).toBe(true);
    expect(wantsLobbyMusic({ station: "desk", target: "room" })).toBe(false);
    expect(wantsLobbyMusic({ station: "noteboard", target: "entrance" })).toBe(false);
  });
});

describe("nextTrack", () => {
  it("goes round the playlist", () => {
    const count = LOBBY_TRACKS.length;
    expect(nextTrack(0, count)).toBe(1);
    expect(nextTrack(count - 1, count)).toBe(0);
    expect(nextTrack(3, 0)).toBe(0);
  });
});

describe("hushMusic", () => {
  it("keeps the music quiet until every hush is released, each only once", () => {
    expect(isMusicHushed()).toBe(false);
    const micTest = hushMusic();
    const other = hushMusic();
    micTest();
    micTest();
    expect(isMusicHushed()).toBe(true);
    other();
    expect(isMusicHushed()).toBe(false);
  });
});
