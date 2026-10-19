"use client";

/**
 * The objects the user handles, built from the same toon boxes as the rest
 * of the building:
 *
 *   LedgerBook      the performance record, closed on the front desk
 *   ReportsFolder   a manila folder of scorecards on the front desk
 *   NoticeBoard     the settings board on the lobby wall, notes pinned on it;
 *                   its "Settings" header is what the user clicks
 *   TableNotepad    the interviewer's notepad on the interview table
 *
 * Each object is modelled lying flat with its top edge toward −Z, the way
 * Liftable expects (it turns the object's +Y face toward the camera).
 */

import { DESK, NOTEBOARD, TABLE } from "../world";
import { Clickable, Liftable } from "./Interactive";
import { Box } from "./parts";

const COUNTER_TOP = DESK.height + 0.06;

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
  return (
    <>
      <Liftable name="ledger" action="ledger" station="desk" position={[-0.85, COUNTER_TOP, DESK.z - 0.32]} rotation={[0, 0.18, 0]}>
        <Book />
      </Liftable>
      <Liftable name="reports" action="reports" station="desk" position={[0.85, COUNTER_TOP, DESK.z - 0.32]} rotation={[0, -0.14, 0]}>
        <Folder />
      </Liftable>
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

/** Pinned notes on the board: paper, a coloured pin, a few written lines. */
const NOTES: { x: number; y: number; w: number; h: number; tilt: number; color: string }[] = [
  { x: 2.45, y: 1.55, w: 0.95, h: 0.75, tilt: 0.04, color: "paper" },
  { x: 3.85, y: 1.5, w: 1.0, h: 0.8, tilt: -0.05, color: "noteYellow" },
];

export function NoticeBoard() {
  const { left, right, bottom, top, z } = NOTEBOARD;
  const width = right - left;
  const cx = (left + right) / 2;
  return (
    <group>
      {/* Frame and cork. */}
      <Box size={[width, top - bottom, 0.06]} at={[cx, (top + bottom) / 2, z + 0.03]} color="wood" />
      <Box size={[width - 0.12, top - bottom - 0.32, 0.02]} at={[cx, (top + bottom) / 2 - 0.1, z + 0.07]} color="cork" />

      {NOTES.map((n) => (
        <group key={n.x} position={[n.x, n.y, z + 0.09]} rotation={[0, 0, n.tilt]}>
          <Box size={[n.w, n.h, 0.008]} at={[0, 0, 0]} color={n.color} />
          {[0.18, 0.06, -0.06, -0.18].map((dy, i) => (
            <Box key={dy} size={[n.w * (i === 0 ? 0.55 : 0.75), 0.022, 0.004]} at={[-n.w * 0.06, dy, 0.006]} color="ink" />
          ))}
          <Box size={[0.05, 0.05, 0.04]} at={[0, n.h / 2 - 0.06, 0.02]} color="pin" />
        </group>
      ))}

      {/* The header plank: "Settings". Clicking it walks the user to the board. */}
      <Clickable action="settings" station="desk" position={[cx, top - 0.13, z + 0.1]}>
        <Box size={[width - 0.3, 0.2, 0.05]} at={[0, 0, 0]} color="paper" />
        {/* Hand-lettered "SETTINGS": eight ink strokes, read as a word at a glance. */}
        {[-0.7, -0.5, -0.3, -0.1, 0.1, 0.3, 0.5, 0.7].map((x) => (
          <Box key={x} size={[0.11, 0.09, 0.006]} at={[x, 0, 0.028]} color="ink" />
        ))}
      </Clickable>
    </group>
  );
}
