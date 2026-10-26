"use client";

/**
 * The objects the user handles: the desk objects (Liftable, named by floating
 * labels), the settings notice board (Clickable) and the room's notepad.
 * Desk objects are modelled lying flat, top edge toward −Z.
 */

import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

import { finishMaterial, type Finish } from "@/components/three/finishes";
import { letteringGeometry, letteringWidth, useLetteringFont } from "@/components/three/lettering";

import { useBuilding } from "../BuildingProvider";
import { BOARD_FRAME, BOARD_NOTES, BOARD_PLANK, DESK, NOTEBOARD, TABLE, type BoardNote } from "../world";
import { FloatingLabel } from "./FloatingLabel";
import { Clickable, Liftable } from "./Interactive";
import { Box } from "./parts";
import { ScreenAnchor } from "./ScreenAnchor";
import { box, roundedSlab } from "./shapes";

type Vec3 = [number, number, number];

const COUNTER_TOP = DESK.height + 0.06;

/** Where each desk object rests, and where its name floats. */
const ON_DESK = {
  ledger: { at: [-1.25, COUNTER_TOP, DESK.z - 0.32] as Vec3, turn: 0.18, label: 0.3 },
  clipboard: { at: [-0.6, COUNTER_TOP, DESK.z - 0.3] as Vec3, turn: 0.1, label: 0.34 },
  reports: { at: [0.75, COUNTER_TOP, DESK.z - 0.32] as Vec3, turn: -0.14, label: 0.3 },
} as const;

/** Where the secretary looks when the user points at something. */
export const LOOK_POINTS: Record<string, readonly [number, number, number]> = {
  ledger: [ON_DESK.ledger.at[0], COUNTER_TOP + 0.05, ON_DESK.ledger.at[2]],
  clipboard: [ON_DESK.clipboard.at[0], COUNTER_TOP + 0.05, ON_DESK.clipboard.at[2]],
  reports: [ON_DESK.reports.at[0], COUNTER_TOP + 0.05, ON_DESK.reports.at[2]],
  settings: [(NOTEBOARD.left + NOTEBOARD.right) / 2, (NOTEBOARD.bottom + NOTEBOARD.top) / 2, NOTEBOARD.z],
};

/** Turns a shape from shapes.roundedSlab (upright, facing +Z) to lie face up, its top edge toward −Z. */
const FLAT: Vec3 = [-Math.PI / 2, 0, 0];

/** A block of pages: paper top and bottom, page edges on the four sides (BoxGeometry's ±X, ±Y, ±Z). */
function usePageBlock(): THREE.Material[] {
  const gl = useThree((s) => s.gl);
  return useMemo(() => {
    const edge = finishMaterial(gl, "pageEdge");
    const paper = finishMaterial(gl, "paper");
    return [edge, edge, paper, paper, edge, edge];
  }, [gl]);
}

/** A brass cap for a book corner, lying flat: its right angle at the origin, legs along −X and ±Z. */
function cornerCap(towardZ: 1 | -1): THREE.ExtrudeGeometry {
  const leg = 0.045;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-leg, 0);
  // Shape y becomes −Z once laid flat.
  shape.lineTo(0, -towardZ * leg);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.0012, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0006, bevelSegments: 1 });
}
const CORNERS = { back: cornerCap(1), front: cornerCap(-1) };

/** A closed book: leather boards round a block of pages, a rounded spine, brass corners and title plate. */
function Book() {
  const gl = useThree((s) => s.gl);
  const pages = usePageBlock();
  const brass = finishMaterial(gl, "brass");
  return (
    <group>
      <Box size={[0.34, 0.012, 0.44]} at={[0, 0.006, 0]} finish="leather" round={0.004} cast />
      <mesh geometry={box([0.322, 0.05, 0.424])} material={pages} position={[0.006, 0.037, 0]} castShadow receiveShadow />
      <Box size={[0.34, 0.012, 0.44]} at={[0, 0.068, 0]} finish="leather" round={0.004} cast />
      <Box size={[0.036, 0.076, 0.444]} at={[-0.163, 0.037, 0]} finish="leather" round={0.017} cast />
      <mesh geometry={CORNERS.back} material={brass} position={[0.17, 0.0742, -0.22]} rotation={FLAT} castShadow />
      <mesh geometry={CORNERS.front} material={brass} position={[0.17, 0.0742, 0.22]} rotation={FLAT} castShadow />
      <Box size={[0.16, 0.004, 0.06]} at={[0.01, 0.076, -0.1]} finish="brass" round={0.0015} />
      <Box size={[0.1, 0.003, 0.008]} at={[0.01, 0.0785, -0.1]} finish="ink" />
    </group>
  );
}

const FOLDER = {
  back: roundedSlab({ w: 0.33, h: 0.42, r: 0.012, depth: 0.003, bevel: 0.0008 }),
  front: roundedSlab({ w: 0.33, h: 0.4, r: 0.012, depth: 0.003, bevel: 0.0008 }),
  tab: roundedSlab({ w: 0.12, h: 0.05, r: 0.012, depth: 0.003, bevel: 0.0008 }),
};

/** A manila folder round a stack of sheets, two loose on top, and a dark label on the tab. */
function Folder() {
  const gl = useThree((s) => s.gl);
  const pages = usePageBlock();
  const manila = finishMaterial(gl, "manila");
  // The front cover's underside and top.
  const lid = 0.0158;
  const lidTop = lid + 0.0046;
  return (
    <group>
      <mesh geometry={FOLDER.back} material={manila} rotation={FLAT} castShadow receiveShadow />
      <mesh geometry={box([0.3, 0.008, 0.396])} material={pages} position={[0.004, 0.0086, 0.002]} castShadow receiveShadow />
      {[0, 1].map((i) => (
        <Box
          key={i}
          size={[0.3, 0.0012, 0.4]}
          at={[0.012 * (i + 1), 0.0133 + 0.0013 * i, -0.006 * i]}
          rotation={[0, 0.02 * (i ? -1 : 1), 0]}
          finish="paper"
          cast
        />
      ))}
      <mesh geometry={FOLDER.front} material={manila} position={[0, lid, 0.012]} rotation={FLAT} castShadow receiveShadow />
      <mesh geometry={FOLDER.tab} material={manila} position={[-0.08, lid, -0.205]} rotation={FLAT} castShadow receiveShadow />
      <Box size={[0.09, 0.0012, 0.024]} at={[-0.08, lidTop + 0.0006, -0.212]} finish="ink" round={0.0005} />
    </group>
  );
}

const hingeGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.1, 16);
const rivetGeometry = new THREE.CylinderGeometry(0.004, 0.004, 0.003, 12);

/** The setup clipboard, matching ui/Clipboard.tsx. Modelled upright, then laid flat. */
function Clipboard() {
  const gl = useThree((s) => s.gl);
  const metal = finishMaterial(gl, "clipmetal");
  const boardH = 0.35;
  const top = boardH / 2;
  return (
    <group rotation={FLAT}>
      <mesh
        geometry={roundedSlab({ w: 0.26, h: boardH, r: 0.022, depth: 0.007, bevel: 0.002 })}
        material={finishMaterial(gl, "board")}
        castShadow
        receiveShadow
      />
      <Box size={[0.22, 0.28, 0.0015]} at={[0, -0.022, 0.01175]} finish="paper" cast />
      <Box size={[0.12, 0.009, 0.001]} at={[-0.035, 0.085, 0.013]} finish="ink" />
      {[0.05, 0.015, -0.02, -0.055, -0.09, -0.125].map((y) => (
        <Box key={y} size={[0.18, 0.004, 0.001]} at={[0, y, 0.013]} finish="rule" />
      ))}
      {/* The clip: a plate riveted to the board, its hinge, and the jaw on the paper. */}
      <mesh
        geometry={roundedSlab({ w: 0.11, h: 0.06, r: 0.016, depth: 0.005, bevel: 0.0015 })}
        material={metal}
        position={[0, top - 0.03, 0.011]}
        castShadow
        receiveShadow
      />
      {[-0.038, 0.038].map((x) => (
        <mesh key={x} geometry={rivetGeometry} material={metal} position={[x, top - 0.014, 0.0195]} rotation={[Math.PI / 2, 0, 0]} />
      ))}
      <mesh geometry={hingeGeometry} material={metal} position={[0, top - 0.044, 0.0205]} rotation={[0, 0, Math.PI / 2]} castShadow />
      <mesh
        geometry={roundedSlab({ w: 0.09, h: 0.03, r: 0.01, depth: 0.003, bevel: 0.001 })}
        material={metal}
        position={[0, top - 0.06, 0.0128]}
        rotation={[-0.12, 0, 0]}
        castShadow
        receiveShadow
      />
    </group>
  );
}

const ringGeometry = new THREE.TorusGeometry(0.013, 0.0016, 8, 24);

/** A spiral-bound notepad, shut: its mustard cover over a block of pages, wire rings round the top edge. */
function Notepad() {
  const gl = useThree((s) => s.gl);
  const pages = usePageBlock();
  const wire = finishMaterial(gl, "clipmetal");
  return (
    <group>
      {/* Back board, the pages, and the mustard cloth cover closed over them. */}
      <Box size={[0.2, 0.004, 0.28]} at={[0, 0.002, 0]} finish="notepad" round={0.0015} cast />
      <mesh geometry={box([0.19, 0.018, 0.268])} material={pages} position={[0, 0.013, 0.004]} castShadow receiveShadow />
      <Box size={[0.2, 0.004, 0.272]} at={[0, 0.024, 0.006]} finish="notepad" round={0.0015} cast />
      {[-0.07, -0.035, 0, 0.035, 0.07].map((x) => (
        <mesh key={x} geometry={ringGeometry} material={wire} position={[x, 0.015, -0.13]} rotation={[0, Math.PI / 2, 0]} castShadow />
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

/** Painted lettering lying on a surface at z = 0 of its group, lit as the surface is. */
function Painted({ text, size, at, finish = "ink" }: { text: string; size: number; at: Vec3; finish?: Finish }) {
  const gl = useThree((s) => s.gl);
  const font = useLetteringFont();
  const geometry = letteringGeometry(font, { text, size, depth: size * 0.08, anchor: "surface" });
  return <mesh geometry={geometry} material={finishMaterial(gl, finish, { decal: true })} position={at} />;
}

/** The secretary's name, and where her nameplate stands: front of the counter, between the clipboard and the reports. */
const NAMEPLATE = { name: "Ms. Crystal", title: "RECEPTION", at: [0.06, COUNTER_TOP, DESK.z - 0.05] as Vec3, turn: -0.04 };

/** Leans the plate back, so it faces the user standing at the desk. */
const PLATE_LEAN = -0.32;

/** A desk nameplate facing +Z: a wooden block, a black plate in a brass bezel leaning in its slot, the name in raised brass. */
export function NamePlate() {
  const gl = useThree((s) => s.gl);
  const font = useLetteringFont();
  const name = letteringGeometry(font, { text: NAMEPLATE.name, size: 0.032, depth: 0.0015, anchor: "surface" });
  const title = letteringGeometry(font, { text: NAMEPLATE.title.split("").join(" "), size: 0.011, depth: 0.0008, anchor: "surface" });
  const brass = finishMaterial(gl, "brass", { decal: true });
  const plateW = letteringWidth(name) + 0.07;
  const plateH = 0.08;
  // The bezel, and the black face set into it: each face is its depth plus its bevel out from z = 0.
  const bezel = 0.006;
  const face = bezel + 0.002;
  return (
    <group position={NAMEPLATE.at} rotation={[0, NAMEPLATE.turn, 0]}>
      {/* The block, and the brass lip of the slot the plate stands in. */}
      <Box size={[plateW + 0.03, 0.024, 0.06]} at={[0, 0.012, 0]} finish="wood" round={0.006} cast />
      <Box size={[plateW + 0.018, 0.004, 0.01]} at={[0, 0.025, 0.012]} finish="brass" round={0.0015} />
      <group position={[0, 0.02, 0.002]} rotation={[PLATE_LEAN, 0, 0]}>
        <mesh
          geometry={roundedSlab({ w: plateW, h: plateH, r: 0.007, depth: bezel - 0.001, bevel: 0.001 })}
          material={finishMaterial(gl, "brass")}
          position={[0, plateH / 2, 0]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={roundedSlab({ w: plateW - 0.01, h: plateH - 0.01, r: 0.004, depth: 0.0015, bevel: 0.0005 })}
          material={finishMaterial(gl, "ink")}
          position={[0, plateH / 2, bezel]}
          receiveShadow
        />
        {/* The name, and her post under it. */}
        <mesh geometry={name} material={brass} position={[0, plateH / 2 + 0.008, face]} />
        <mesh geometry={title} material={brass} position={[0, 0.019, face]} />
      </group>
    </group>
  );
}

const pinGeometry = new THREE.SphereGeometry(0.028, 20, 14);

const NOTE_LOOK: Record<BoardNote, { title: string; paper: Finish }> = {
  defaults: { title: "PREFERENCES", paper: "paper" },
  account: { title: "ACCOUNT", paper: "noteYellow" },
};

/** Height of a note's title band, above its controls. */
const NOTE_TITLE_BAND = 0.3;

/** One note pinned on the board: paper, a pin, its title, room for its controls. */
function PinnedNote({ name, inUse }: { name: BoardNote; inUse: boolean }) {
  const gl = useThree((s) => s.gl);
  const n = BOARD_NOTES[name];
  const look = NOTE_LOOK[name];
  return (
    <group position={[n.x, n.y, NOTEBOARD.z + 0.034]} rotation={[0, 0, n.tilt]}>
      <Box size={[n.w, n.h, 0.006]} at={[0, 0, 0.003]} finish={look.paper} cast />
      <mesh geometry={pinGeometry} material={finishMaterial(gl, "pin")} position={[0, n.h / 2 - 0.07, 0.03]} castShadow />
      <Painted text={look.title} size={0.055} at={[0, n.h / 2 - 0.17, 0.0065]} />
      {/* Pencil lines until the real controls are pinned on. */}
      {!inUse &&
        [0.06, -0.06, -0.18, -0.3].map((y, i) => (
          <Box key={y} size={[n.w * (i % 2 ? 0.55 : 0.72), 0.018, 0.002]} at={[-n.w * 0.06, y, 0.0075]} finish="ink" />
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

/** The settings notice board: clicked from the desk; at the board its notes carry the controls. */
export function NoticeBoard() {
  const gl = useThree((s) => s.gl);
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

  // A deep wooden frame round the cork, so it shades the cork's edges.
  const frame = useMemo(
    () =>
      roundedSlab({
        w: width,
        h: height,
        r: 0.07,
        depth: 0.06,
        bevel: 0.01,
        hole: { w: width - 2 * BOARD_FRAME, h: height - 2 * BOARD_FRAME, r: 0.03 },
      }),
    [width, height],
  );

  return (
    <group>
      {/* Clicked anywhere from the desk: the user goes to the board. */}
      <Clickable action="settings" station="desk" hoverScale={1}>
        <mesh geometry={frame} material={finishMaterial(gl, "wood")} position={[cx, cy, z]} castShadow receiveShadow />
        <Box size={[width - 2 * BOARD_FRAME + 0.02, height - 2 * BOARD_FRAME + 0.02, 0.02]} at={[cx, cy, z + 0.012]} finish="cork" />
        {/* The header plank, lettered SETTINGS. */}
        <mesh
          geometry={roundedSlab({ w: width - 2 * BOARD_FRAME - 0.08, h: BOARD_PLANK - 0.05, r: 0.035, depth: 0.016, bevel: 0.004 })}
          material={finishMaterial(gl, "paper")}
          position={[cx, plankY, z + 0.022]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={settingsLetters}
          material={finishMaterial(gl, pointed ? "accent" : "ink", { decal: true })}
          position={[cx, plankY, z + 0.046]}
        />
        {(Object.keys(BOARD_NOTES) as BoardNote[]).map((name) => (
          <PinnedNote key={name} name={name} inUse={inUse} />
        ))}
      </Clickable>

      {/* At the board: the way back. */}
      {atBoard && (
        <Clickable action="desk" station="noteboard" position={[right - BOARD_FRAME - 0.06 - tagW / 2, plankY, z + 0.046]}>
          <mesh
            geometry={roundedSlab({ w: tagW, h: 0.1, r: 0.028, depth: 0.012, bevel: 0.003 })}
            material={finishMaterial(gl, "accent")}
            castShadow
            receiveShadow
          />
          <mesh geometry={back} material={finishMaterial(gl, "paper", { decal: true })} position={[0, 0, 0.018]} />
        </Clickable>
      )}
    </group>
  );
}
