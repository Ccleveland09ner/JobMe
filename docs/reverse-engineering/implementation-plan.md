# Implementation plan: the building's entrance and the walk between rooms

**Source analysis:** [feature-analysis.md](feature-analysis.md). **Target flow:** [interaction-flow.md](interaction-flow.md).
**Named destination:** **the entrance** (arrival, loading, sign-in, stepping inside) and **the walk** (every movement between the door, the front desk, the noteboard and the interview room). The walk is the building's navigation grammar, so this plan also fixes where every existing JobMe function lives.

Status: plan only. No frontend code has been changed.

---

## 1. Reference approach versus the building

The reference application is a free-roaming showroom. JobMe is a place with a purpose: the user arrives to practise an interview. Where the two conflict, the building wins.

| Reference behaviour (evidence) | Conflict with the building model | Decision for JobMe |
|---|---|---|
| Free first-person walking with WASD/arrows and Shift to sprint (§3.2, §8) | Exploration is not the task. Free movement makes every function something the user has to *find*, which breaks "everything begins at the front desk". It is unusable for keyboard-only users without a spatial model, for screen-reader users, and on touch devices | **Guided movement between authored stations.** The user is *led* (by the secretary, or by choosing a destination). The camera travels on fixed paths. No WASD locomotion |
| Pointer lock on entry, Esc to release ([Inferred], §8) | Captures the cursor away from forms the user must fill in (sign-in, setup, answers) | **No pointer lock.** Optional drag-to-look within a station, limited in range and returning to centre |
| "Enter the office" gate over a dimmed live scene (§3.2) | None. It fits arrival at a building | **Adopt** as "Step inside". It also serves as the first user gesture, which unlocks audio before the interviewer speaks (`/api/tts`) |
| Loader with percentage (§3.3) | A spinner-like bar has no place inside a building | **Re-express** as the building's lights coming up. A literal percentage still goes to a polite status region |
| E to interact with highlighted objects nearby (§3.2, §8) | Proximity depends on free movement, which JobMe does not have | **Hotspots per station**, highlighted on hover/focus and activated by click, Enter/Space, or E as an optional accelerator |
| A DOM control group mirroring an in-scene object, with a live status (§4) | None. It is exactly what the accessibility constraint needs | **Adopt for every fixture.** Each interactive object in the scene has a DOM twin, and the DOM is the source of truth |
| One GLB for the whole space plus 12 baked 2048 px lightmaps, all loaded up front (§7) | Loading the interview room before the user has signed in wastes bandwidth on the critical path | **Adopt baked lighting and Draco. Split loading** into the lobby first and the corridor/room deferred |
| Draco decoder self-hosted under `/draco/` (§7) | None | **Adopt.** Copy the decoder from the `three` package into `public/draco/`. Do not depend on a third-party CDN |
| WebGL context-loss listeners (§5.1) | None | **Adopt** and add a visible fallback (§9) |

---

## 2. Prerequisites and dependencies

1. **Rebase `feature/rea-frontend-reconstruction` onto `origin/main`.** This branch is based on `b680aa6`. `origin/main` (PRs #5 and #6) already adds `three@^0.186.1`, `@react-three/fiber@^9.8.1`, `@react-three/drei@^10.7.9`, `@types/three`, `public/models/recruiter.glb`, `Recruiter3D.tsx`, `RecruiterStage.tsx` and `RoomScenery.tsx`. This plan builds on them.
2. **New runtime dependencies: none.**
   - Camera sequencing uses `gsap` (already a dependency).
   - Damping uses `THREE.MathUtils.damp`.
   - Loading progress uses drei's `useProgress`.
   - State uses React context with `useReducer`. Do not import `zustand` directly, even though R3F depends on it.
3. **Tooling that would need approval, all optional:**
   - **Draco compression:** Blender's built-in glTF exporter can apply Draco with no new tool. That is the recommended path.
   - **KTX2/Basis textures:** `@gltf-transform/cli` would be a new dev tool. Defer it until the performance budget (§8) is missed with WebP.
4. **Before writing any route or layout code, read `node_modules/next/dist/docs/`** (see `AGENTS.md`). Confirmed for this version of Next.js:
   - "On navigation, layouts preserve state, remain interactive, and do not rerender" (`01-app/01-getting-started/03-layouts-and-pages.md:43`).
   - Layouts cannot read the pathname, but a client component inside one can, with `usePathname()` (`01-app/03-api-reference/03-file-conventions/layout.md:240–242`).

   One persistent canvas across routes depends on both facts.

---

## 3. Architecture

### 3.1 One building, many routes

URLs stay as they are. A route group gives every building route one shared layout that owns the canvas, so the canvas is never unmounted by navigation.

```
src/app/
  layout.tsx                      (root, unchanged)
  (building)/
    layout.tsx                    ← BuildingProvider + BuildingCanvas + StationLayer + Announcer
    login/page.tsx                ← station "entrance"
    dashboard/page.tsx            ← station "desk"
    interview/new/page.tsx        ← station "desk" (form out)
    interview/[id]/page.tsx       ← station "room"
    interview/[id]/report/page.tsx← station "desk" (file open)
    settings/page.tsx             ← station "noteboard" (new route)
  page.tsx                        ← signed-out: entrance; signed-in: redirect to /dashboard
  logout/route.ts                 (unchanged; triggered by the door)
  api/…                           (unchanged)
```

The existing `dashboard/layout.tsx` and `interview/layout.tsx` (which hold `AppShell`/`AppHeader`) are folded into `(building)/layout.tsx`. The header's links become fixtures at the desk and the door. A global header is free-floating chrome, which the building does not allow.

Each `page.tsx` keeps its data fetching (server components, `requireUser()`, Supabase queries) and renders its **station panel**, the DOM content for that location, as children of the layout. The layout places that panel in the station's anchor slot.

### 3.2 Components

| Component | Location | Responsibility |
|---|---|---|
| `BuildingProvider` | `components/building/BuildingProvider.tsx` | Owns `BuildingState` (§4). Maps `usePathname()` to a station. Exposes `walkTo(station, { hold })`, `arrive()` and `fail(reason)` |
| `BuildingCanvas` | `components/building/BuildingCanvas.tsx` | Client-only (`next/dynamic`, `ssr: false`). R3F `<Canvas>` with `frameloop="demand"` while idle. Renders `BuildingModel`, `CameraRig`, `Hotspots`, `Secretary` and the room's existing `Recruiter3D` |
| `BuildingModel` | `components/building/BuildingModel.tsx` | Loads `lobby.glb` immediately and `wing.glb` (corridor and room) after sign-in. Applies baked lightmaps per area. Draco decoder path `/draco/` |
| `CameraRig` | `components/building/CameraRig.tsx` | Tweens the camera between station poses (§5) with a gsap timeline. Supports holding, reversing, and the reduced-motion cut |
| `LookAround` | `components/building/LookAround.tsx` | Drag and arrow-key look within limits (±35° yaw, ±12° pitch), springing back to the station pose. Disabled in the room |
| `Hotspot` | `components/building/Hotspot.tsx` | A scene object with highlight on hover/focus. Registers its DOM twin in `StationLayer`. Activation calls the same handler as the twin |
| `StationLayer` | `components/building/StationLayer.tsx` | The DOM layer above the canvas: the current station panel, the station's fixture buttons (DOM twins) and the station heading. Manages focus on arrival |
| `Announcer` | `components/building/Announcer.tsx` | One polite region (station arrivals, progress) and one assertive region (errors). Same pattern as the reference's global `alert` |
| `EntranceGate` | `components/building/EntranceGate.tsx` | The street view, the lights coming up (from `useProgress`), the sign-in card, and "Step inside" (the audio-unlock gesture) |
| `Secretary` | `components/building/Secretary.tsx` | The secretary character: idle, attending, reading, walking, knocking. Reuses the rig approach of `Recruiter3D.tsx` (baked clips, `design/tools/bake_animation.py`) |
| `IllustratedBuilding` | `components/building/IllustratedBuilding.tsx` | An SVG/still version of each station. It renders on the server, while assets load, without WebGL, and after context loss. Same pattern as `RecruiterStage` with `Avatar` |
| `buildingMachine.ts` | `components/building/buildingMachine.ts` | A pure reducer for `BuildingState`, unit-tested like `roomMachine.ts` |

Existing components move into station panels unchanged in behaviour:
- `LoginForm` goes to the entrance.
- `DashboardSummary`, `SessionList`, `TrendChart`, `Pagination`, `SetupForm` and its children, `ReportGenerator`, `HighlightedTranscript` and the `score/*` components go to the desk.
- `InterviewRoom` and its children go to the room.

---

## 4. State ownership

```ts
type Station = "street" | "entrance" | "desk" | "noteboard" | "corridor" | "room";

interface BuildingState {
  station: Station;                 // where the camera is (settled)
  target: Station | null;           // where it is heading
  hold: "none" | "awaiting";        // waiting at a waypoint for a request
  failure: string | null;           // sanitised, user-facing
  assets: { lobby: Load; wing: Load; progress: number };  // Load = "idle"|"loading"|"ready"|"failed"
  render: "3d" | "illustrated";     // falls back on no WebGL / load failure / context loss
  motion: "full" | "reduced";       // prefers-reduced-motion OR the noteboard preference
  quality: "high" | "low";          // lightmap resolution, DPR cap
  audioUnlocked: boolean;           // set by "Step inside"
}
```

- **The building owns where the user is and how they get there.** It never reads interview semantics: no bands, moves or scores. This is the same rule `roomMachine.ts` states for the screen versus the interview.
- **Routes own data.** Pages fetch, and the building only places them.
- **The room owns its phase.** `roomMachine` is unchanged. The building receives only `station = "room"`, plus the recruiter's existing `state` prop for idle animation.
- **Station versus route:** normally `station` is derived from the pathname. During a walk that masks a request, `target` is set first, the route changes on arrival, and `station` settles when both have happened. On a hard reload the station is set from the route with no walk.
- **Persistence:** `motion` and `quality` preferences are stored per user (§6). Nothing about position persists. A reload always lands at the route's station.

---

## 5. Camera and animation sequencing

### 5.1 Station poses

Authored in the building's Blender file as named empties (`CAM_entrance`, `CAM_desk`, …) and read from the GLB at load, so artists can move them without code changes.

| Move | Path | Duration | Easing | Notes |
|---|---|---|---|---|
| street → entrance | dolly forward | 0.9 s | `power2.inOut` | Plays as the lights come up |
| entrance → desk | through the door, then pan to the secretary | 1.2 s | `power2.inOut` | Door hinge animates during the first 0.4 s |
| desk ↔ noteboard | side-step and yaw | 0.6 s | `power1.inOut` | |
| desk → corridor (hold point) | follows the secretary | 1.6 s | `power1.inOut` then linear | Holds at the room door until `arrive()`; knock loop at 2.2 s intervals |
| corridor → room | door opens, sit-down dip | 1.0 s | `power2.out` | |
| room → desk | reverse | 2.2 s | `power2.inOut` | |
| desk → entrance (leave) | turn, walk, door closes | 1.2 s | `power2.in` | Then `POST /logout` |
| any failure return | reverse of the current segment from its current progress | ≤ 1.2 s | `power2.inOut` | `gsap` timeline `.reverse()` |

### 5.2 Rules

- **One timeline at a time.** A new `walkTo` while moving is ignored unless it reverses the current move.
- **Input during a walk:**
  - The DOM layer for the destination mounts on arrival.
  - The outgoing panel fades out over the first 150 ms, and focus is parked on the `<main>` landmark.
  - Pointer events on the canvas are ignored.
- **Reduced motion:** every move becomes a 150 ms cross-fade between still frames rendered at the two poses. Head-bob, sway and parallax are off. A hold renders the corridor still with "The secretary knocks…" as text.
- **The frame loop runs on demand.** `frameloop="demand"` keeps the GPU idle at stations. `invalidate()` is called on tween update and on idle-animation ticks (the secretary's and recruiter's idle clips run at 30 fps).

---

## 6. Feature-to-location map

Every current function has a place.

| Existing function (code) | Location | In-world action | Performed by |
|---|---|---|---|
| Sign in with email OTP (`login/login-form.tsx`) | Entrance: visitor's book by the door | The user writes their email, then the code | The door (lock) |
| Landing page (`app/page.tsx`, crowd and campus hero) | Street, outside the building | The user arrives | — |
| Dashboard summary and trend (`DashboardSummary`, `TrendChart`) | Desk: the ledger and its margin chart | The user reads the ledger | Secretary |
| Interview history, paged (`SessionList`, `Pagination`) | Desk: ledger pages | The user turns pages | Secretary |
| Delete a session (`SessionRow`) | Desk: ledger line | The user asks the secretary to strike a line; the secretary confirms first | Secretary |
| Start setup (`/interview/new`, `SetupForm`) | Desk: form brought out | The user asks for an interview | Secretary |
| Interview mode, Quick or Full (`ModeSelector`) | Desk: the form | The user ticks a box | Secretary |
| Resume upload and processing (`ResumeSelector`, `/api/resume`) | Desk: handing over | The user hands the secretary their resume | Secretary |
| Job description (`JobDescriptionField`) | Desk: clipped to the form | The user hands over the posting | Secretary |
| Mic check and input mode (`MicCheck`) | Desk: desk meter | The user says a few words | Secretary |
| Create session (`POST /api/sessions`) | Corridor | The user is led to the room | Secretary |
| Adaptive interview (`InterviewRoom`, `roomMachine`) | Room | The user answers | Interviewer avatar |
| Interviewer notes, progress, captions | Room: notepad, table marker, captions | The user sees the notes being taken | Interviewer avatar / room |
| End early (`EndInterviewDialog`) | Room | The interviewer asks if the user is sure | Interviewer avatar |
| Scorecard and report (`/interview/[id]/report`) | Desk: filing cabinet | The secretary lays the file open | Secretary |
| Preferences (new `/settings`; seeded with default input mode, default interview mode, motion, quality) | Lobby noteboard | The user re-pins a card | Room (fixture) |
| Sign out (`POST /logout`) | Front door | The user walks out | Door |
| Not found (`not-found.tsx`) | Desk | The secretary says there is no such room and offers the ledger | Secretary |
| Unhandled error (`error.tsx`) | Wherever the user is, as the illustrated building | The lights flicker; "Something went wrong here. Try again" | Room |
| `dev/recruiter` (origin/main) | Excluded, dev-only | — | — |

**New location: the noteboard is in the lobby, not the interview room.** Preferences are chosen before an interview and apply to every one. Putting the board in the room would mean entering an interview to change a setting, and changing settings mid-interview would disturb a running session. The board hangs beside the desk, one short step from the hub, which keeps "everything begins at the front desk" true.

**New fixture: the filing cabinet.** Scorecards are records produced after an interview. The brief gives them no home, and the desk owns the user's records (the ledger), so the cabinet sits behind the desk.

**Settings persistence:** JobMe has no settings storage today. Proposal:
- `motion` and `quality` stay in `localStorage`, per device, because they describe the machine.
- Default input mode and default interview mode go on a new `user_preferences` row, which needs a migration.

This is open question 2 (§12).

---

## 7. Perception: waiting and failure

Every wait has a visible in-world activity *and* a literal status line. Every failure has an in-world consequence *and* a literal message in the assertive region.

| Operation | Waiting looks like | Failure looks like | Literal fallback text |
|---|---|---|---|
| Asset load | Lights come up bank by bank | The illustrated building is shown; nothing is blocked | "Preparing the building… N%" / "Showing the simplified building." |
| Send code / verify code | Pen hovering; lock turning | Lock stays shut; reason written in the book | Existing `LoginForm` errors |
| Resume upload | Taking → reading → filing (interaction-flow §4.1) | Document handed back with the reason | Existing upload error text |
| Mic check | Desk meter | Secretary suggests typing | Existing `MicCheck` text |
| Create session | Walk, then knock at the door | Walk back to the desk; the form stays filled | Existing `SetupForm` error |
| Turn submit | Interviewer glances at the notes | "Sorry, I didn't catch that" | Existing `roomMachine` `error` |
| Report generation | Typewriter at the desk | Secretary apologises; offers to try again | Existing `ReportGenerator` text |
| Sign out | Door closing | Door does not latch; the user is still inside | "Couldn't sign out. Try again." |
| WebGL context lost | — | Scene swaps to the illustrated building at the same station; it swaps back when the context is restored | "Showing the simplified building." |

---

## 8. Assets and performance

- **Model:** JobMe's own building, modelled and baked in Blender. Nothing from the reference is reused: no geometry, textures, photos, fonts or names.
  - `lobby.glb` covers the street, entrance, desk and noteboard. Target ≤ 1.5 MB with Draco.
  - `wing.glb` covers the corridor and the room. Target ≤ 1.5 MB. It is prefetched after sign-in.
  - The existing `recruiter.glb` (1.1 MB) loads with the wing. A secretary model should share its rig.
- **Lighting:** baked lightmaps split by area, following the reference's area-split approach (`lobby_shell`, `lobby_desk`, `corridor`, `room_shell`, `room_table`).
  - WebP at 2048 px on the high tier and 1024 px on the low tier.
  - Static versus interactive geometry is baked separately so hotspots can highlight without re-baking.
- **Draco decoder:** copy `node_modules/three/examples/jsm/libs/draco/gltf/*` to `public/draco/` with a script beside `scripts/prep-art.ts`, and point drei's `useGLTF` at `/draco/`.
- **Budgets on a mid-range laptop:**
  - Time to interactive sign-in form ≤ 1.5 s, because the 3D scene is not on the critical path.
  - Lobby rendered ≤ 4 s on a fast 4G connection.
  - ≤ 60 draw calls per station.
  - DPR capped at 1.5 (high) or 1 (low).
- **Quality tier:** start at `high`. Drop to `low` if the first 60 frames average under 40 fps, or if `navigator.hardwareConcurrency ≤ 4`. The noteboard can override it.
- **Loading UI:** progress from drei's `useProgress`, across the lobby assets only.

---

## 9. Responsive behaviour

- **Narrow or portrait screens:**
  - The vertical field of view widens so the secretary and the panel both fit. The reference reads a `fov` parameter ([Inferred] camera tuning); JobMe derives FOV from the aspect ratio instead.
  - Station panels become bottom sheets over the lower 55% of the screen, and the camera pose shifts upward to keep the subject visible above the sheet.
- **Touch:** one-finger drag to look (within limits). No keyboard instructions are shown on touch-only devices, unlike the reference at 602 px (§3.2).
- **Large screens:** panels anchor beside their fixture (the desk to the right of the secretary, the noteboard card on the board) using screen-space positioning computed from the fixture's projected bounds, clamped to the viewport.

---

## 10. Accessibility

The spatial narrative is presentation, not semantics.

- **Headings:** each station has a literal heading that works on its own: "Sign in", "Front desk: your interviews", "Start an interview", "Interview room", "Scorecard", "Settings". In-world names are secondary visual text.
- **The DOM is the source of truth:**
  - Every hotspot has a DOM twin (a button or link) in `StationLayer`, following the reference's radio pattern (feature-analysis §4).
  - The canvas is `aria-hidden="true"`, with an `aria-describedby` description of the current station for context.
  - Nothing is reachable only through the scene.
- **Focus order:** on arrival, focus moves to the station heading. Tab order then follows the panel's reading order, then the station's fixture buttons ("Go to settings", "Sign out"). Focus never lands inside the canvas.
- **Keyboard:** all actions work with Tab, Enter and Space. E is an optional accelerator for the highlighted fixture. It is ignored while focus is in `input`, `textarea`, `select` or `[contenteditable]`, and it never steals focus. Arrow-key look is active only when the scene container itself has focus.
- **Live regions:** polite for arrivals ("You are at the front desk.") and progress (throttled), assertive for errors. The room keeps its existing captions and status semantics.
- **Motion:** honour `prefers-reduced-motion`, plus the noteboard override (§5.2).
- **Audio:** the interviewer's voice starts only after the "Step inside" gesture or another explicit start control. Captions are always available.
- **Without WebGL:** `IllustratedBuilding` provides the same stations, the same panels and the same order.

---

## 11. Delivery phases

| Phase | Scope | Exit check |
|---|---|---|
| P0 | Rebase onto `origin/main`. Read the Next.js docs on route groups and layouts | Tests and typecheck pass |
| P1 | `(building)` route group, `BuildingProvider`, `buildingMachine` with tests, `StationLayer`, `Announcer`, `IllustratedBuilding`. Existing panels moved in. **No 3D yet** | Every route works with the illustrated building; keyboard and screen-reader pass |
| P2 | `BuildingCanvas`, `lobby.glb`, `CameraRig` for street → entrance → desk ↔ noteboard, `EntranceGate` with audio unlock, `Hotspot` | Lobby budget met; WebGL-off and context-loss fallback verified |
| P3 | `wing.glb`, `Secretary`, the corridor walk that masks `POST /api/sessions` with hold and failure return, room arrival hand-off to `InterviewRoom` | The walk never outruns or stalls the request; failure returns to a filled form |
| P4 | Noteboard and `/settings`, preference persistence (after open question 2), leaving through the door | Preferences apply on the next interview; sign-out failure path verified |
| P5 | Quality tiers, mobile bottom sheets, performance pass | Budgets in §8 on a mid-range laptop and phone |

Tests:
- `buildingMachine.test.ts`: every transition, including hold, failure-reverse and reload.
- Existing `roomMachine` tests stay green.
- A manual a11y checklist per station.
- A reduced-motion run.
- A forced WebGL-off run.

---

## 12. Open questions

1. **The secretary's look and voice:** the illustrated style (matching the room's line-art) versus the 3D style of `Recruiter3D`, and whether the secretary speaks through `/api/tts` or only in captions.
2. **Preference storage:** is a `user_preferences` table acceptable, or should preferences stay device-local for the MVP?
3. **The landing page:** the current crowd-and-campus hero (in this branch's staged changes) could become the street (§0), or be retired.
4. **Free look:** should the lobby allow any free movement at all, or only the limited drag-to-look proposed here?

---

## 13. What is not taken from the reference

- No code. Only the structural observations in feature-analysis.md informed this plan, and no minified source is reproduced.
- No assets: models, lightmaps, photos, the Caveat font file, logos or copy.
- No reference-specific features: the radio, the live HTML screen, the wall plug or the `/api/radio/*` endpoints.

What is taken are general, widely used techniques that the reference demonstrates: baked lightmaps, Draco-compressed glTF with a self-hosted decoder, R3F event delegation, an entry gesture before an immersive scene, and DOM twins for in-scene controls.
