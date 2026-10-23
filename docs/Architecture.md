# JobMe architecture

How the code is organised, which way dependencies point, what the data layer guarantees, and where new code goes. The product itself is described in `PRD-JobMe-MVP.md` and `TechDesign-JobMe-MVP.md`, and how answers are scored in `Scoring-Rubric.md`.

## Layers

| Directory | Responsibility | Imports |
|---|---|---|
| `src/lib/engine` | The interview policy, pure: the question bank, the topic table (`topics.ts`: each topic's label and purpose, which the browser may read; the bank stays on the server), role families, the rubric and its weights, banding, the next move, notepad lines. No I/O. | nothing outside `lib/engine` |
| `src/lib/interview` | Application services, one workflow each, with storage and models passed in: `start.ts` (`startInterview`), `turn.ts` (`submitAnswer` over a `TurnStore`), `report.ts` (`runReport` over a `ReportStore`). Each returns an outcome union, which the route maps to HTTP. | `lib/engine`, the integrations, the pure shared modules, `lib/schemas` |
| `src/lib/plan.ts`, `lib/stats.ts`, `lib/jd/profile.ts`, `lib/resume/facts.ts`, `lib/job-link.ts` | Pure modules the server and the browser share: reading a stored question plan (`parsePlan`, the job text prompts see, planned openings), speaking stats and grouping turns by original question, how a role and resume facts are written into prompts, the posting-link check. | `lib/engine`, `lib/schemas` |
| `src/lib/ai`, `lib/jd`, `lib/resume`, `lib/job-posting.ts` | Server-side integrations: the LLM and embeddings, job descriptions, resume ingestion (`lib/resume/ingest.ts`, with its store passed in), fetching posting links. | `lib/engine`, the pure shared modules, `lib/schemas`, each other; `lib/resume/store.ts` also the server Supabase client |
| `src/lib/voice` | Browser speech: recognition, the recruiter's voice, lip-sync. | `lib/frontend/motion.ts` |
| `src/lib/frontend` | What the browser needs, mostly pure: row → view adapters, labels and score formatting, view types, page plans for the ledger, folder and setup sheets, the loaders pages read with, the typed API client (`api.ts`), small browser helpers (`motion.ts`, `dom.ts`). | `lib/engine`, the pure shared modules, `lib/schemas`, `lib/voice`; server modules as `import type` only |
| `src/lib/supabase`, `lib/auth.ts`, `lib/http.ts` | Infrastructure: the server and browser clients, auth guards, and the answers every route shares (401/404/422/500/503). | `lib/schemas` |
| `src/app` | Pages (server components) and API routes, kept thin: auth, validation, wiring and the response. | anything |
| `src/components` | UI. `building/` is the 3D office and the DOM layer over it; `desk/`, `setup/`, `room/` are the documents and the interview room; `report/` holds the report's blocks; `score/` the score bars and their colours; `ui/` and `common/` shared primitives and hooks. | `lib`, other components |

`src/lib/architecture.test.ts` walks every value import and fails the build's tests if a rule breaks:
- there are no import cycles;
- `lib` never imports `components` or `app`;
- `lib/engine` imports nothing outside itself;
- a `"use client"` module never reaches `lib/supabase/server`, `lib/auth`, `lib/ai/*`, `lib/resume/store` or `lib/engine/bank`. Server modules reach the client only as `import type`.

## Request flows

**An answer** (`POST /api/sessions/[id]/turns`):
1. The route authenticates, validates the body (`lib/http.ts` `readBody`), and hands it to `submitAnswer` with a `TurnStore` over the server client.
2. `submitAnswer` loads the session, its recent turns and the resume, and checks the turn sequence: a stale one is answered with the state to resync from. It builds the context with `turnContextFrom`, which reads the plan through `lib/plan.ts`.
3. `runTurn` scores the answer, decides its band and the gap to chase in code (`judgeAnswer`), lets the engine pick the next move, and words the next question: planned, drafted, or a bank seed.
4. The `submit_turn` RPC saves the turn and the new engine state in one transaction.
5. The route maps the outcome (saved, nudge, stale, finished, not found, failed) to its status and body.

**Starting an interview** (`POST /api/sessions`): `startInterview` in `lib/interview/start.ts` reads the resume and posting, takes the role family's default topics (`lib/engine/roles.ts`), makes one time-boxed plan call that may re-choose and re-word them for the job, sets the opening state, and saves the session through a store the route provides. Without the model the plan is the role defaults plus the job, so a session never starts on nothing, and the recruiter's first line says when job details couldn't be used.

**The scorecard** (`POST /api/sessions/[id]/report`): `runReport` groups the turns by original question (`lib/stats.ts`), scores each question by its latest evaluation, writes the text (or a fallback built in code), then completes the session and files the report.

**A resume** (`POST /api/resume`): `ingestResume` (`lib/resume/ingest.ts`) reads the PDF, distils the role and the facts, and stores the resume and its chunks through the store the route passes in. The route maps its outcome (stored, unreadable, empty, model unavailable, store failed) to a status.

**Pages** read through RLS with the server client, through loaders that take a `RowReader` (`lib/supabase/reader.ts`): `loadLedgerShelf` and `loadLedgerVolume` (`lib/frontend/ledger.ts`), `loadReportDocument`, `loadReportIndex` and `latestFiledReportId` (`lib/frontend/report-document.ts`), `loadRoom`, `loadSetup` and `loadProfile`. The report loaders group the turns by question the same way the report did, so "Q2" in the feedback is Q2 on every sheet. The reports folder loads other tabs with the same loaders over the browser client.

**The browser** calls the API only through `lib/frontend/api.ts`, which returns typed outcomes (ok, failed with a readable message, or offline) instead of raw responses.

## Data integrity

- **Turns** are written by `submit_turn` (migration `20260927110000`). One transaction writes the turn row and advances `engine_state`, but only from the sequence the caller read (optimistic concurrency). A double-fired submit loses with a 409, and the client resyncs.
- **Reports** are filed once: `session_id` is the primary key, and a second request returns the stored report. The session is completed before the report is filed, so a crash in between leaves a finished interview whose report the next request writes, never a filed report on an interview the ledger still offers to resume. A report found on an unfinished session completes it.
- **Resumes**: the resume row is saved first, then its chunks. If the chunks fail, the row is deleted by hand, and a failed rollback is reported so the orphan can be found.
- **Deletes** are a single statement; turns and reports cascade.
- **Row-level security:** every table is read and written as the signed-in user. Migration `20261022120000_parent_ownership_checks.sql` (written, not yet applied) makes each insert also check that its parent row is the user's, and revokes update and delete grants nothing uses.
- **In the browser:** setup sends Begin once, the room submits once per turn sequence, the folder ignores a slower tab load that a newer choice has replaced, and delete can't be confirmed twice. Work that can outlive its component (Begin, a submit, the microphone permission prompt) checks `useAlive` before it acts on the page, so leaving never pulls the user back or leaves the microphone open.

## The building and its documents

- `BuildingProvider` holds the 3D office's state. `heldMachine.ts` is the single object being held (ledger, clipboard, reports folder or notepad), and `Liftable` flies it to the camera.
- `StationLayer` is the DOM over the canvas:
  - `stationLayout.ts` holds its routing rules: path → layout, and path → held object.
  - `stationEffects.ts` holds its effects: heading focus, held sync, desk actions, camera inset.
- The held documents are fixed-size pages turned by `components/ui/book-slider.tsx`:
  - the ledger book (`desk/Ledger.tsx`) and the reports folder (`desk/ReportsFolder.tsx`), which share their frame and close behaviour (`useHeldDocument`, `HeldDocument` in `held/Held.tsx`);
  - the setup clipboard (`setup/SetupForm.tsx`, with `useSheetTurner` and `useBeginInterview`).
- `book-slider.tsx` sits on `book-engine.tsx`, the adapter to react-pageflip. It sizes the book with `useBookFit`, takes arrow keys through `usePageArrowKeys` (shared with the notepad's pages), and its page content keeps mouse presses through `FlipSafe`.
- Long content is measured off-screen and packed onto pages (`usePaginatedPages`, `lib/frontend/paginate.ts`), so nothing scrolls inside a page. Each document's layout is kept, so coming back to it doesn't measure it again, and `useLastReady` keeps the previous document on screen while a changed one is measured.
- The report's blocks live in `components/report/`, one file per section, and `desk/ReportSheets.tsx` maps each block to its component. The folder rewrites the URL as tabs change, and follows the URL when it changes, so Back and Forward show the report the URL names.
- The interview room (`room/InterviewRoom.tsx`) is the phase machine (`roomMachine.ts`) wired to `useVoiceAnswer` (the candidate's voice), `useRoomSpeech` (the recruiter's) and `useTurnSubmission`. The 3D recruiter's rig is plain three.js in `room/recruiterRig.ts`.

## Where things go

- **A new API route:** use `lib/http.ts` for the shared answers, put the workflow in `lib/interview` with its storage passed in and an outcome union to return, and add a `route.test.ts` beside it that pins every status and body. `lib/testing/fake-supabase.ts` scripts the database.
- **A new call from the browser:** add a function to `lib/frontend/api.ts` returning a typed outcome; components never call `fetch` on the app's own API.
- **New rows for a page:** add a loader beside the existing ones, taking a `RowReader` so it works with either client and can be tested with the fake.
- **A new held document:** compose `HeldDocument`, `BookSlider`, `DocumentPage` and `DocumentParts`, and give it a page plan in `lib/frontend` with tests.
- **Showing a score or a name:** colours from `components/score/levels.ts`; numbers through `formatScore` and `scoreOutOf`, and an interview's name through `interviewTitle` (`lib/frontend/labels.ts`), so every page prints them the same way.
- **A script:** import `scripts/_load-env.ts` first, so `.env.local` is in place before any app module reads it, pace model calls with `scripts/_pace.ts`, and reuse the services (`startInterview`, `judgeAnswer`) rather than copying their rules.

## Tests

`npm test` runs everything (vitest, Node, no network):
- the layer rules (`lib/architecture.test.ts`);
- the engine harness;
- the pipelines over in-memory stores (`lib/interview/*.test.ts`);
- every API route's HTTP contract (`src/app/api/**/route.test.ts`);
- the loaders over the fake database;
- the pure planners and formatters;
- the scripts' helpers (`scripts/*.test.ts`).

`npm run rehearse` drives whole interviews through the real turn pipeline with a scripted evaluator, also without network.

Also run `npm run typecheck`, `npm run lint` and `npm run build` before shipping.
