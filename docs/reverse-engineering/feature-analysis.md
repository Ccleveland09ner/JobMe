# Feature analysis: first-person entry and walk-through

**Reference application:** https://office.graffico.it/ ("Graffico Office | a 3D studio you can walk through")
**Feature:** The entry gate and first-person navigation of a 3D space: the load screen, the controls overlay with its "Enter the office" button, keyboard/mouse movement, and proximity interaction with highlighted objects.
**Expected interaction:** The page loads a 3D scene behind a loader. A controls overlay is then shown over the dimmed, live scene. The user presses "Enter the office", walks with WASD/arrow keys, looks with the mouse, sprints with Shift, interacts with highlighted objects using E, and releases the cursor with Esc.
**Captured:** 2026-10-14, Chrome 154.0.8037.98, REA 6.4.0 over CDP at `http://127.0.0.1:9222`, target `5C5BD7C794C99D4636DCAF26231078FD`.

This document describes the reference application only, in its own terms. How the feature maps onto JobMe is in [implementation-plan.md](implementation-plan.md).

---

## 1. Evidence index

| Ref | REA operation | Evidence ID | What it holds |
|---|---|---|---|
| E-TGT | `list_browser_targets` | `ev_e7d40e6699e674523133457034e760c03efd1ab9e46dc31dcc3b5dce482bed64` | One page target, origin `https://office.graffico.it` |
| E-PAGE | `inspect_web_page` (a11y text, console text, storage keys, 1500 ms) | `ev_e05e45cb8c4099660ef2ee1d28c637c964e2fac9c471e9a9cfbd5cf492933ed9` | DOM (168 nodes), accessibility tree (117 nodes), 14 scripts, 42 resources, console, storage, workers |
| E-PAGE0 | `inspect_web_page` (defaults) | `ev_74d9e6d338915af2b4e0277c69b7c7147d9726235efe21badb9dad0fcb6571e1` | Same structure without text capture |
| E-SHOT | `capture_web_screenshot` | `ev_f23f0fba9036b7a54570289a916f795e41eebb648f96ca3f435e31f7d165ae3e` (PNG sha256 `445f074e…970d`) | Controls overlay at 602×879 |
| E-SHOT2 | `capture_web_screenshot` | `ev_680026b85c6ec55860b129f0a753269f1b9c75141c8d5211a68e1f74ecfa22fc` | Same overlay after a failed automated click |
| E-L-CANVAS | `inspect_web_event_listeners` `canvas` | `ev_c58d2454c140a7d81ac1bbc03843c692b6878956fe352b3d56e06e3c6025f266` | Listeners on the `<canvas>` |
| E-L-ROOT | `inspect_web_event_listeners` `div:has(> div > canvas)` | `ev_af155a993000fd2a455b9213887c78aa1c05810898579054943252a2c8f82bc0` | Listeners on the canvas wrapper |
| E-L-ENTER | `inspect_web_event_listeners` on the Enter button | `ev_357ee1a20874f58f90d8a510ba3c7fdccb6720a3fb743847fb006abb7972e9c8` | Listeners on "ENTER THE OFFICE" |
| E-SCN-LOAD | `capture_browser_scenario` (connect, reload, network events) | `ev_e4f50f2b209b8064cffa5f776f866bd175f59f520e25f896343c62937ba17db2` | Full load-time request sequence (78 requests) |
| E-SCN-HL | `capture_browser_scenario` (headless launch, 1280×720) | no evidence ID; returned as `partial_observation` after `cleanup_incomplete` | Loader screenshot and overlay-over-scene screenshot |
| E-BUNDLE | `analyze_web_bundle` (no source maps) | `ev_1452c12c63e2c5aff05c92d2bf10f6a74d8d1cc1480669696a4a7e9a58c956e9` | Chunk inventory, vendor fingerprints, endpoint/key candidates |
| E-SESSION | `observe_web_session` (10 s) | `ev_ceddc206b59911e99b9321cb521be01ea000acfccf06bc3f138eb1593f592c6f` | Lifecycle timeline |

Raw evidence files were kept in a session scratch directory and are not committed. Screenshots of the reference site are not reproduced in this repository.

**Labels used below:** **[Observed]** is directly present in evidence. **[Stated]** is text the reference page publishes about itself; it is observed text, but it is the site's own claim. **[Inferred]** is a reasoned conclusion not directly shown. **[Unknown]** could not be determined.

---

## 2. Technology stack

| Finding | Status | Basis |
|---|---|---|
| Next.js, Turbopack build | [Observed] | `/_next/static/chunks/turbopack-*.js`; E-BUNDLE fingerprint "Next.js", confidence high |
| React | [Observed] | E-BUNDLE fingerprint "React", confidence medium, in three chunks |
| three.js | [Observed] | Console warning prefixed `THREE.WebGLProgram: Program Info Log:` from `2nb77gdn5hy4t.js:491` (E-PAGE); WebGL extension probing in `1nybu1axt8560.js` (E-BUNDLE) |
| React Three Fiber | [Stated] + [Inferred] | Page text: "rendered in the browser with React Three Fiber" (E-PAGE a11y node 11). The wrapper's listener set (§5) matches R3F's pointer-event registration |
| Scene authored in Blender with baked lighting | [Stated] + [Observed] | Page text: "Built in Blender with baked lighting". `/models/baked/2048/BK_*.webp` lightmaps (E-SCN-LOAD) |
| Draco-compressed glTF | [Observed] | `/models/graffico-office-p16a-draco-webp.glb`, `/draco/draco_wasm_wrapper.js`, `/draco/draco_decoder.wasm` (E-SCN-LOAD) |
| Self-hosted Draco decoder in Web Workers | [Inferred] | Decoder served from the site's own `/draco/` path; four loads of one blob script plus blob-URL workers in E-PAGE |
| Image-based environment lighting | [Inferred] | `/models/baked/env_probe.exr` fetched after the GLB |
| Source maps | [Observed] absent | E-BUNDLE `source_maps.status: not_requested`; no `sourceMappingURL` on any script (E-PAGE0) |
| Cloudflare bot management and RUM | [Observed] | `/cdn-cgi/challenge-platform/...`, `/cdn-cgi/rum`, `static.cloudflareinsights.com` beacon. Not part of the feature |

---

## 3. Visual composition and DOM structure

### 3.1 Document layout [Observed, E-PAGE]

```
BODY
├─ DIV[hidden]
├─ MAIN
│  ├─ DIV#…                         ← text block: H1 + 3 paragraphs (SEO / no-JS description)
│  ├─ NOSCRIPT
│  └─ DIV[style]                    ← experience root
│     ├─ DIV[style] > DIV[style] > CANVAS[data-engine,width,height]   ← WebGL surface
│     ├─ DIV[role,aria-label="Graffico desk radio"]                   ← DOM mirror of an in-scene object
│     │    P (disclosure), BUTTON[aria-pressed] ×1, BUTTON[disabled] ×2,
│     │    LABEL > INPUT[type=range], P[aria-live,role=status]
│     └─ DIV[class]                 ← entry overlay
│          P "Graffico Office", controls list (8 × KBD), BUTTON "ENTER THE OFFICE", footer link
├─ SCRIPT …                          ← Next.js flight data
└─ IFRAME                            ← Cloudflare challenge
```

### 3.2 Entry overlay [Observed, E-SHOT, E-SCN-HL]

- A title, "Graffico Office", in a display serif.
- A "CONTROLS" card that maps keys to actions:
  - `W A S D`: "Walk around · arrow keys too"
  - Mouse icon: "Look around"
  - `Shift`: "Go faster"
  - `E` (rendered in an accent colour): "Interact · near highlighted objects"
  - `Esc`: "Release the cursor"
- A primary button, "ENTER THE OFFICE →".
- A footer: "The studio behind this office graffico.it ↗".
- At 1280×720 the overlay is centred over the **live 3D scene**, which is rendered and dimmed behind it. The room geometry, window light and furniture are visible (E-SCN-HL, step `enter`).
- At 602×879 the same overlay is shown with the same keyboard instructions. No touch-specific instructions were present at that width.

### 3.3 Loader [Observed, E-SCN-HL step `scenario_start`]

- A dark full-screen panel with the "Graffico Office" title, a thin horizontal progress bar, the label "LOADING THE OFFICE" and a percentage readout (captured at "0%").
- The loader appears before the overlay. How it transitions into the overlay was not captured [Unknown].

### 3.4 Off-screen description [Observed, E-PAGE a11y]

The page carries a heading, "Graffico Office - the Graffico studio in 3D", and a prose description of everything the space contains: two workstations, a radio, a live HTML/CSS screen, a project board, an awards shelf, a lounge and a wall plug. It also describes the controls in words. Screen readers and crawlers get a complete text equivalent of the 3D experience. Whether it is visually hidden or simply covered by the experience root is [Unknown]; the DOM shows no `hidden` attribute on it.

---

## 4. Accessibility structure [Observed, E-PAGE]

| Node | Role | Name / content |
|---|---|---|
| Page | RootWebArea | "Graffico Office \| a 3D studio you can walk through" |
| Description | heading (level 1) + paragraphs | See §3.4 |
| Radio mirror | group | "Graffico desk radio" |
| | paragraph | "Turning the radio on opens a direct browser connection to the selected third-party radio station." |
| | button, `pressed=false` | "Turn the radio on" |
| | button, disabled | "Previous station" |
| | button, disabled | "Next station" |
| | slider, 0–100 | "Radio volume" |
| | status, polite, atomic | "Radio off." |
| Global | alert, assertive, atomic | (empty) |
| Overlay | button | "ENTER THE OFFICE" |
| Overlay | link | "graffico.it" |

**Pattern [Observed]:** at least one interactive object in the 3D scene, the radio, is exposed as an ordinary DOM control group outside the canvas, with real buttons, a real slider and a live status region. The disabled state of the station buttons tracks the radio being off.

**Pattern [Inferred]:** the empty assertive `alert` region is a global announcer for transient messages such as interaction prompts and errors. Its contents during use were not captured.

**Not exposed [Observed]:** the canvas has no role or label. The movement controls have no DOM equivalent apart from the overlay's descriptive text. A keyboard-only user cannot walk except through the key handlers, and a screen-reader user has no position or orientation feedback.

---

## 5. Event wiring

### 5.1 Canvas [Observed, E-L-CANVAS]

| Event | Location |
|---|---|
| `webglcontextlost` | `1nybu1axt8560.js:381:24531` and `2nb77gdn5hy4t.js:491:70230` |
| `webglcontextrestored` | `1nybu1axt8560.js:381:24605` |
| `webglcontextcreationerror` | `1nybu1axt8560.js:381:24804` |

No pointer or keyboard listeners are attached to the canvas directly. The second `webglcontextlost` listener sits in the same chunk as the movement code (§6) [Observed]. That suggests application-level handling of context loss on top of the renderer's own [Inferred].

### 5.2 Canvas wrapper [Observed, E-L-ROOT]

`click`, `contextmenu`, `dblclick`, `wheel` (passive), `pointerdown`, `pointerup`, `pointermove`, `pointerleave`, `pointercancel` (passive), `lostpointercapture` (passive), all from `1nybu1axt8560.js:392`.

This is the event set React Three Fiber attaches to its container to raycast pointer events into the scene graph [Inferred from the match]. Scene objects that receive `onClick`/`onPointerOver` handlers are reached through this delegation.

### 5.3 Enter button [Observed, E-L-ENTER]

One `click` listener, located in `3jh1u-s3k0bkk.js:0:22728`. The code at that location is React DOM's internal no-op click handler, which React attaches to elements that have an `onClick` prop. **The application's actual Enter handler is a React prop and could not be attributed through listener inspection** [Unknown]. What happens on click (pointer-lock request, audio unlock, overlay dismissal, camera hand-off) is therefore not established from code.

### 5.4 Keyboard [Unknown location]

No `keydown`/`keyup` listeners were found on the inspected elements. They are almost certainly on `window` or `document`, which `inspect_web_event_listeners` cannot select with a CSS selector [Inferred]. The bundle shows key state kept in a mutable `Set` held in a React ref: `n.current.delete("Shift")` in `2nb77gdn5hy4t.js:492:61708` and `f.current.delete("Shift")` in `08wq3b45gsv3v.js:1:34897` (E-BUNDLE) [Observed]. This is the usual "pressed-keys set read every frame" pattern [Inferred].

---

## 6. Script and chunk inventory [Observed, E-PAGE, E-BUNDLE, E-SCN-LOAD]

| Chunk | Bytes | Load phase | Notes |
|---|---|---|---|
| `44yc3rrrxvbae.js` | 2,236,376 | Lazy, after GLB request | Largest chunk. Contents not characterised [Unknown]; likely scene or three.js add-ons [Inferred] |
| `1nybu1axt8560.js` | 880,323 | Initial | three.js renderer (WebGL extension probes), R3F event system (§5.2), React fingerprint |
| `2nb77gdn5hy4t.js` | 398,267 | Initial | Application scene code: key set (`Shift`), `fov` lookup, `mode` lookup, radio API calls, context-loss handler, three.js shader log |
| `3jh1u-s3k0bkk.js` | 203,384 | Initial | React DOM |
| `00mo9wt7jabwh.js` | 197,469 | Initial | Not characterised |
| `3qk2c_a6-pvxm.js` | 57,909 | Initial | Cookie / `set-cookie` header handling (Next.js runtime) |
| `08wq3b45gsv3v.js` | 45,734 | Lazy | Second key-set controller (`Shift`). Possibly an alternate or in-scene controller [Inferred] |
| others | < 25 KB each | Initial / lazy | Next.js runtime, Turbopack runtime |

**Other static findings (E-BUNDLE):**
- `fov` and `mode` are read through `.get(...)` calls in `2nb77gdn5hy4t.js:492`. Most likely these are URL search parameters or a settings map that tune the camera field of view and an experience mode [Inferred]. Their semantics are [Unknown].
- `fetch("/api/radio/stations")` and `fetch("/api/radio/click")` belong to the radio object, not to navigation.
- No routes other than `/`. The experience is a single page.
- No WebMCP declarations.

---

## 7. Load sequence [Observed, E-SCN-LOAD, E-SESSION]

Sequence of one full reload, grouped by scenario step:

1. **Document and shell:** `/`, 2 woff2 fonts, 1 CSS file, 9 initial chunks, Cloudflare scripts.
2. **Scene assets, requested once the app boots:**
   1. `/models/graffico-office-p16a-draco-webp.glb`: **one GLB for the whole space**, Draco geometry with WebP textures.
   2. `/draco/draco_wasm_wrapper.js`, `/draco/draco_decoder.wasm`, then blob workers.
   3. Lazy chunks `3riwyh608c8x2.js`, `44yc3rrrxvbae.js`, `08wq3b45gsv3v.js`.
   4. `/models/baked/env_probe.exr`.
   5. 12 lightmaps at `/models/baked/2048/`:
      - interior: `BK_STA_arch_shell`, `BK_STA_arch_details`, `BK_STA_ws_andrea`, `BK_STA_ws_lorenzo`, `BK_STA_storage`, `BK_STA_lounge`, `BK_INT_boards_static`, `BK_STA_shelf_contents`
      - exterior: `BK_ext_city`, `BK_ext_green`, `BK_ext_ground`, `BK_ext_sky`
   6. Content images (board photos, screen captures, logo, a framed photo) and `/textures/perlin.png`.
   7. 12 blob `other` requests, likely decoded or uploaded texture data [Inferred].
   8. `/fonts/caveat-latin-700-normal.woff` fetched by XHR. A handwriting font fetched as data rather than as CSS suggests it is used for text rendered inside the 3D scene [Inferred].
3. **Deferred:** `andrea-monitor-a.webp` and `andrea-monitor-b.webp` loaded only after the overlay was shown. The trigger is [Unknown].

**Naming [Observed]:** lightmaps are split by area (workstations, storage, lounge, shelf) and by static versus interactive geometry (`STA` / `INT`). Exterior views are baked separately.

**Timing [Observed, E-SESSION]:** `domcontentloaded` +303 ms, `load` +304 ms, `networkalmostidle` +1,671 ms, `networkidle` +13,327 ms. The window partly predates REA's attach, so the absolute values are approximate.

**Storage [Observed, E-PAGE]:** session storage key `graffico-radio` (value redacted). No local storage, IndexedDB or Cache Storage. Nothing about position or progress persists across tabs.

---

## 8. Interaction lifecycle

| Stage | Status | Description |
|---|---|---|
| 1. Boot | [Observed] | Shell and initial chunks load; the loader shows "LOADING THE OFFICE" with a percentage |
| 2. Asset streaming | [Observed] | GLB → Draco decode → lazy chunks → environment probe → lightmaps → content images |
| 3. Loader → overlay | [Observed] end state; transition [Unknown] | The overlay appears over the rendered, dimmed scene |
| 4. Enter | [Observed] control; behaviour [Unknown] | User activates "ENTER THE OFFICE". The handler is a React prop (§5.3) |
| 5. Cursor capture | [Inferred] | "Esc: Release the cursor" implies the Pointer Lock API is requested on Enter. Not observed |
| 6. Locomotion | [Stated] + [Inferred] | WASD/arrows translate, mouse rotates, Shift increases speed. Key state is kept in a ref-held Set (§5.4). Speed, acceleration, eye height and collision are [Unknown] |
| 7. Proximity interaction | [Stated] | "E: Interact · near highlighted objects". Objects within some range are highlighted and E activates them. Range, highlight technique and focus selection are [Unknown] |
| 8. Release | [Stated] + [Inferred] | Esc exits pointer lock. Whether the overlay returns is [Unknown] |
| 9. Context loss | [Observed] handlers | Context lost/restored/creation-error listeners are present. The user-facing result is [Unknown] |

---

## 9. Limitations of this investigation

1. **Post-Enter behaviour was not observed.** Two automated clicks on "ENTER THE OFFICE" timed out:
   - Connected to the user's Chrome, the click timed out after 15 s (E-SCN-LOAD, step `enter`).
   - In headless Chrome launched by REA, it timed out after 20 s. There the 12 s settle step took 42 s (E-SCN-HL), which shows the page's main thread was saturated under software WebGL.
   - Playwright's actionability checks depend on animation frames. The likely cause is a background window in the first case and a saturated renderer in the second [Inferred].

   Pointer lock, movement physics, highlight effects, overlay dismissal and camera transitions are therefore described only from the page's own text.
2. **The Enter handler's code is not attributable** (§5.3).
3. **Keyboard listener registration sites were not inspected**, because `window`/`document` cannot be selected with a CSS selector (§5.4).
4. **No source maps are published.** All code-level findings refer to minified chunk positions. **No original source code was recovered** and none is claimed.
5. **Touch and mobile behaviour is unknown.** The narrow viewport showed only keyboard instructions.
6. **Script source text** was captured transiently by `analyze_web_bundle` and `inspect_web_event_listeners` for analysis only. None is reproduced here, and the export step (`export_web_scripts`) was not run.

**To close gaps 1–3:** a person activates "ENTER THE OFFICE" in the visible, focused Chrome window while `observe_web_execution` runs for about 20 s. The coverage counts would show which functions in `2nb77gdn5hy4t.js` and `08wq3b45gsv3v.js` execute on Enter and during movement.
