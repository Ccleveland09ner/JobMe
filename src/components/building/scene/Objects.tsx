"use client";

/**
 * The objects the user handles — the office is the interface. Built from the
 * same toon solids and ink lines as the rest of the building:
 *
 *   on the front desk, each named by lettering floating over it:
 *     LedgerBook   "LEDGER"           the interview history (the dashboard)
 *     Clipboard    "START INTERVIEW"  the interview setup form
 *     Folder       "REPORTS"          the scorecards
 *   on the wall behind:
 *     NoticeBoard  SETTINGS lettered on its header plank; its two pinned
 *                  notes carry the settings controls once the user is at the
 *                  board (ScreenAnchor + components/settings/BoardNotes.tsx)
 *   in the interview room:
 *     TableNotepad the interviewer's notepad
 *
 * The desk objects are Liftable (picked up, then their page self takes
 * over); the board is Clickable (the camera goes to it). Each is modelled
 * lying flat with its top edge toward −Z, as Liftable expects; the board
 * faces +Z off the wall.
 */

import { useMemo } from "react";
import * as THREE from "three";

import { letteringGeometry, letteringMaterials, letteringWidth, useLetteringFont } from "@/components/three/lettering";
import { toonMaterial, type PaletteColor } from "@/components/three/toon";

import { useBuilding } from "../BuildingProvider";
import { BOARD_FRAME, BOARD_NOTES, BOARD_PLANK, DESK, NOTEBOARD, TABLE, type BoardNote } from "../world";
import { FloatingLabel } from "./FloatingLabel";
import { Clickable, Liftable } from "./Interactive";
import { Box, InkEdges } from "./parts";
import { ScreenAnchor } from "./ScreenAnchor";
import { roundedSlab } from "./shapes";

type Vec3 = [number, number, number];

const COUNTER_TOP = DESK.height + 0.06;

/** Where each desk object rests, and where its name floats. */
const ON_DESK = {
  ledger: { at: [-1.25, COUNTER_TOP, DESK.z - 0.32] as Vec3, turn: 0.18, label: 0.3 },
  clipboard: { at: [-0.6, COUNTER_TOP, DESK.z - 0.3] as Vec3, turn: 0.1, label: 0.34 },
  reports: { at: [0.75, COUNTER_TOP, DESK.z - 0.32] as Vec3, turn: -0.14, label: 0.3 },
} as const;

/**
 * Where the secretary looks when the user points at something
 * (TalkingHead's lookAt): each object, and the board's middle.
 */
export const LOOK_POINTS: Record<string, readonly [number, number, number]> = {
  ledger: [ON_DESK.ledger.at[0], COUNTER_TOP + 0.05, ON_DESK.ledger.at[2]],
  clipboard: [ON_DESK.clipboard.at[0], COUNTER_TOP + 0.05, ON_DESK.clipboard.at[2]],
  reports: [ON_DESK.reports.at[0], COUNTER_TOP + 0.05, ON_DESK.reports.at[2]],
  settings: [(NOTEBOARD.left + NOTEBOARD.right) / 2, (NOTEBOARD.bottom + NOTEBOARD.top) / 2, NOTEBOARD.z],
};

/** A closed book: leather boards around a block of pages, a brass title plate. */
function Book() {
  return (
    <group>
      <Box size={[0.34, 0.012, 0.44]} at={[0, 0.006, 0]} color="leather" />
      <Box size={[0.32, 0.05, 0.42]} at={[0.005, 0.037, 0]} color="paper" />
      <Box size={[0.34, 0.012, 0.44]} at={[0, 0.068, 0]} color="leather" />
      <Box size={[0.03, 0.074, 0.44]} at={[-0.17, 0.037, 0]} color="leather" />
      <Box size={[0.16, 0.004, 0.06]} at={[0.01, 0.076, -0.1]} color="brass" />
      <Box size={[0.1, 0.003, 0.008]} at={[0.01, 0.0785, -0.1]} color="ink" />
    </group>
  );
}

/** A manila folder with sheets sticking out, and a dark label on the tab. */
function Folder() {
  return (
    <group>
      <Box size={[0.33, 0.006, 0.42]} at={[0, 0.003, 0]} color="manila" />
      {[0.012, 0.018, 0.024].map((y, i) => (
        <Box key={y} size={[0.3, 0.004, 0.4]} at={[0.012 * (i - 1), y, 0.012 * (1 - i)]} color="paper" />
      ))}
      <Box size={[0.33, 0.006, 0.4]} at={[0, 0.032, 0.012]} color="manila" />
      <Box size={[0.12, 0.006, 0.04]} at={[-0.08, 0.032, -0.205]} color="manila" />
      <Box size={[0.09, 0.003, 0.024]} at={[-0.08, 0.0365, -0.205]} color="ink" />
    </group>
  );
}

/**
 * The setup clipboard, matching the page clipboard it turns into
 * (ui/Clipboard.tsx): a rounded hardboard, a ruled sheet, a metal clip with
 * its lever. Modelled standing in XY, then laid flat.
 */
function Clipboard() {
  const boardH = 0.35;
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={roundedSlab({ w: 0.26, h: boardH, r: 0.022, depth: 0.007, bevel: 0.002 })} material={toonMaterial("board")}>
        <InkEdges threshold={40} />
      </mesh>
      <Box size={[0.22, 0.28, 0.002]} at={[0, -0.022, 0.0115]} color="paper" />
      <Box size={[0.12, 0.009, 0.001]} at={[-0.035, 0.085, 0.013]} color="ink" />
      {[0.05, 0.015, -0.02, -0.055, -0.09, -0.125].map((y) => (
        <Box key={y} size={[0.18, 0.004, 0.001]} at={[0, y, 0.013]} color="rule" />
      ))}
      <mesh
        geometry={roundedSlab({ w: 0.11, h: 0.06, r: 0.016, depth: 0.01, bevel: 0.002 })}
        material={toonMaterial("clipmetal")}
        position={[0, boardH / 2 - 0.03, 0.011]}
      >
        <InkEdges threshold={40} />
      </mesh>
      <Box size={[0.085, 0.012, 0.008]} at={[0, boardH / 2 - 0.05, 0.026]} color="clipmetal" />
    </group>
  );
}

/** A spiral-bound notepad: card back, pages, a row of rings along the top. */
function Notepad() {
  return (
    <group>
      <Box size={[0.2, 0.006, 0.28]} at={[0, 0.003, 0]} color="fabric" />
      <Box size={[0.19, 0.02, 0.27]} at={[0, 0.016, 0.004]} color="paper" />
      {[-0.07, -0.035, 0, 0.035, 0.07].map((x) => (
        <Box key={x} size={[0.012, 0.03, 0.02]} at={[x, 0.02, -0.13]} color="ink" />
      ))}
    </group>
  );
}

export function DeskObjects() {
  const { ledger, clipboard, reports } = ON_DESK;
  const above = (spot: { at: Vec3; label: number }): Vec3 => [spot.at[0], spot.at[1] + spot.label, spot.at[2]];
  return (
    <>
      <Liftable name="ledger" action="ledger" station="desk" position={ledger.at} rotation={[0, ledger.turn, 0]}>
        <Book />
      </Liftable>
      <FloatingLabel action="ledger" station="desk" holds="ledger" at={above(ledger)} lines={["LEDGER"]} />

      <Liftable name="clipboard" action="clipboard" station="desk" position={clipboard.at} rotation={[0, clipboard.turn, 0]}>
        <Clipboard />
      </Liftable>
      <FloatingLabel action="clipboard" station="desk" holds="clipboard" at={above(clipboard)} lines={["START", "INTERVIEW"]} />

      <Liftable name="reports" action="reports" station="desk" position={reports.at} rotation={[0, reports.turn, 0]}>
        <Folder />
      </Liftable>
      <FloatingLabel action="reports" station="desk" holds="reports" at={above(reports)} lines={["REPORTS"]} />
    </>
  );
}

export function TableNotepad() {
  return (
    <Liftable
      name="notepad"
      action="notepad"
      station="room"
      position={[TABLE.x + 0.72, TABLE.height, TABLE.z + 0.12]}
      rotation={[0, -0.25, 0]}
    >
      <Notepad />
    </Liftable>
  );
}

/** Painted lettering lying on a surface at z = 0 of its group. */
function Painted({ text, size, at, color = "ink" }: { text: string; size: number; at: Vec3; color?: PaletteColor }) {
  const font = useLetteringFont();
  const geometry = letteringGeometry(font, { text, size, depth: size * 0.08, anchor: "surface" });
  return <mesh geometry={geometry} material={letteringMaterials(color, color, false)} position={at} />;
}

const pinGeometry = new THREE.SphereGeometry(0.028, 16, 12);

const NOTE_LOOK: Record<BoardNote, { title: string; paper: PaletteColor }> = {
  defaults: { title: "INTERVIEW DEFAULTS", paper: "paper" },
  account: { title: "ACCOUNT", paper: "noteYellow" },
};

/** The title band at the top of a note, above the space its controls take. */
const NOTE_TITLE_BAND = 0.3;

/** One note pinned on the board: paper, a pin, its title, room for its controls. */
function PinnedNote({ name, inUse }: { name: BoardNote; inUse: boolean }) {
  const n = BOARD_NOTES[name];
  const look = NOTE_LOOK[name];
  return (
    <group position={[n.x, n.y, NOTEBOARD.z + 0.034]} rotation={[0, 0, n.tilt]}>
      <Box size={[n.w, n.h, 0.006]} at={[0, 0, 0.003]} color={look.paper} />
      <mesh geometry={pinGeometry} material={toonMaterial("pin")} position={[0, n.h / 2 - 0.07, 0.03]} />
      <Painted text={look.title} size={0.055} at={[0, n.h / 2 - 0.17, 0.0065]} />
      {/* Pencil lines while it is only pinned there; the real controls take
          their place when the user is at the board. */}
      {!inUse &&
        [0.06, -0.06, -0.18, -0.3].map((y, i) => (
          <Box key={y} size={[n.w * (i % 2 ? 0.55 : 0.72), 0.018, 0.002]} at={[-n.w * 0.06, y, 0.0075]} color="ink" />
        ))}
      <ScreenAnchor
        name={`note:${name}`}
        width={n.w - 0.08}
        height={n.h - NOTE_TITLE_BAND - 0.04}
        position={[0, -NOTE_TITLE_BAND / 2 + 0.02, 0.007]}
      />
    </group>
  );
}

/**
 * The settings notice board. One object, always the same one: from the
 * desk its SETTINGS header names it and a click takes the user to it; at the
 * board its notes carry the controls, and its BACK TO DESK tag returns.
 */
export function NoticeBoard() {
  const building = useBuilding();
  const font = useLetteringFont();
  const { left, right, bottom, top, z } = NOTEBOARD;
  const width = right - left;
  const height = top - bottom;
  const cx = (left + right) / 2;
  const cy = (bottom + top) / 2;
  const plankY = top - BOARD_FRAME - BOARD_PLANK / 2;

  const atBoard = building?.state.station === "noteboard" && building.state.target === null;
  const inUse = atBoard && building.cameraAt === "noteboard";
  const pointed = building?.hovered === "settings";

  const settingsLetters = letteringGeometry(font, { text: "S E T T I N G S", size: 0.1, depth: 0.012, anchor: "surface" });
  const back = letteringGeometry(font, { text: "BACK TO DESK", size: 0.034, depth: 0.004, anchor: "surface" });
  const tagW = letteringWidth(back) + 0.1;

  const frame = useMemo(
    () =>
      roundedSlab({
        w: width,
        h: height,
        r: 0.07,
        depth: 0.05,
        bevel: 0.008,
        hole: { w: width - 2 * BOARD_FRAME, h: height - 2 * BOARD_FRAME, r: 0.03 },
      }),
    [width, height],
  );

  return (
    <group>
      {/* Clicked anywhere from the desk: the user goes to the board. */}
      <Clickable action="settings" station="desk" hoverScale={1}>
        <mesh geometry={frame} material={toonMaterial("wood")} position={[cx, cy, z]}>
          <InkEdges threshold={40} />
        </mesh>
        <Box size={[width - 2 * BOARD_FRAME + 0.02, height - 2 * BOARD_FRAME + 0.02, 0.02]} at={[cx, cy, z + 0.012]} color="cork" />
        {/* The header plank, lettered SETTINGS. */}
        <mesh
          geometry={roundedSlab({ w: width - 2 * BOARD_FRAME - 0.08, h: BOARD_PLANK - 0.05, r: 0.035, depth: 0.016, bevel: 0.004 })}
          material={toonMaterial("paper")}
          position={[cx, plankY, z + 0.022]}
        >
          <InkEdges threshold={40} />
        </mesh>
        <mesh
          geometry={settingsLetters}
          material={letteringMaterials(pointed ? "accent" : "ink", pointed ? "accent" : "ink", false)}
          position={[cx, plankY, z + 0.046]}
        />
        {(Object.keys(BOARD_NOTES) as BoardNote[]).map((name) => (
          <PinnedNote key={name} name={name} inUse={inUse} />
        ))}
      </Clickable>

      {/* At the board: the way back, a tag on the header plank's right end. */}
      {atBoard && (
        <Clickable action="desk" station="noteboard" position={[right - BOARD_FRAME - 0.06 - tagW / 2, plankY, z + 0.046]}>
          <mesh geometry={roundedSlab({ w: tagW, h: 0.1, r: 0.028, depth: 0.012, bevel: 0.003 })} material={toonMaterial("accent")}>
            <InkEdges threshold={40} />
          </mesh>
          <mesh geometry={back} material={letteringMaterials("paper", "paper", false)} position={[0, 0, 0.018]} />
        </Clickable>
      )}
    </group>
  );
}
