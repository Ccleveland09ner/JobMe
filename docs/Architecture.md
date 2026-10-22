# JobMe architecture

How the code is organised, which way dependencies point, what the data layer guarantees, and where new code goes. The product itself is described in `PRD-JobMe-MVP.md` and `TechDesign-JobMe-MVP.md`, and how answers are scored in `Scoring-Rubric.md`.

## Layers

| Directory | Responsibility | Imports |
|---|---|---|
| `src/lib/engine` | The interview policy, pure: question bank, role families, the rubric and its weights, banding, the next move, notepad lines. No I/O. | nothing outside `lib/engine` |
| `src/lib/interview` | Application services, one workflow each, with storage and models passed in: `start.ts` (begin an interview), `turn.ts` (one answer), `report.ts` (the scorecard). | `lib/engine`, the integrations, `lib/schemas`, `lib/stats` |
| `src/lib/ai`, `lib/jd`, `lib/resume`, `lib/job-posting.ts` | Server-side integrations: the LLM and embeddings, job descriptions, resume ingestion, posting links. | `lib/engine`, `lib/schemas`, `lib/stats`, each other; `lib/resume/store.ts` also the server Supabase client |
| `src/lib/voice` | Browser speech: recognition, the recruiter's voice, lip-sync. | `lib/frontend/motion.ts` |
| `src/lib/frontend` | What the browser needs, mostly pure: row → view adapters, labels, view types, page plans for the ledger, folder and setup sheets, the typed API client (`api.ts`), small browser helpers (`motion.ts`, `dom.ts`). | `lib/engine`, `lib/schemas`, `lib/stats`, `lib/voice`, the posting-link check; server modules as `import type` only |
| `src/lib/supabase`, `lib/auth.ts`, `lib/http.ts` | Infrastructure: the server and browser clients, auth guards, and the answers every route shares (401/404/422/500). | `lib/schemas` |
| `src/app` | Pages (server components) and API routes, kept thin: auth, validation, wiring and the response. | anything |
| `src/components` | UI. `building/` is the 3D office and the DOM layer over it; `desk/`, `setup/`, `room/` are the documents and the interview room; `ui/` holds shared primitives. | `lib`, other components |

The dependency rules hold today, and are worth keeping:
- there are no import cycles;
- `lib` never imports `components` or `app`;
- client components never import server-only modules (`lib/supabase/server`, `lib/auth`, `lib/ai/llm`, `lib/resume/store`). Server modules reach the client only as `import type`.

## Request flows

**An answer** (`POST /api/sessions/[id]/turns`):
1. The route authenticates, validates the body (`lib/http.ts` `readBody`), and checks the turn sequence. A stale sequence gets a 409 with the state to resync from (`staleTurnBody`).
2. It loads the session, its recent turns and the resume, and builds the context (`turnContextFrom`).
3. `runTurn` scores the answer and picks the next move, in `lib/interview/turn.ts` and `lib/engine`.
4. The `submit_turn` RPC saves the turn and the new engine state in one transaction.
5. The route answers with `turnResponseBody`.

**Starting an interview** (`POST /api/sessions`): `startInterview` in `lib/interview/start.ts` reads the resume and posting, takes the role family's default topics (`lib/engine/roles.ts`), makes one time-boxed plan call that may re-choose and re-word them for the job, sets the opening state, and saves the session through a store the route provides. Without the model the plan is the role defaults plus the job, so a session never starts on nothing.

**The scorecard** (`POST /api/sessions/[id]/report`): `runReport` writes the report once, then completes the session. A follow-up adds to the question it came from, so turns are grouped by original question (`lib/stats.ts`) and each question is scored by its latest evaluation.

**Pages** read through RLS with the server client. The dashboard uses `loadLedgerShelf` and `loadLedgerVolume` (`lib/frontend/ledger.ts`); the report pages use `loadReportDocument` and `loadReportIndex` (`lib/frontend/report-document.ts`), which group the turns by question the same way, so "Q2" in the feedback is Q2 on every sheet. The reports folder loads other tabs with the same loaders over the browser client.

**The browser** calls the API only through `lib/frontend/api.ts`, which returns typed outcomes (ok, failed with a readable message, or offline) instead of raw responses.

## Data integrity

- **Turns** are written by `submit_turn` (migration `20260927110000`). One transaction writes the turn row and advances `engine_state`, but only from the sequence the caller read (optimistic concurrency). A double-fired submit loses with a 409, and the client resyncs.
- **Reports** are idempotent: `session_id` is the primary key, and a second request returns the stored report. If a crash leaves a report on an unfinished session, the next request completes the session (covered by the report tests).
- **Resumes**: the resume row is saved first, then its chunks. If the chunks fail, the row is deleted by hand, and a failed rollback is reported so the orphan can be found.
- **Deletes** are a single statement; turns and reports cascade.
- **In the browser:** setup sends Begin once, the room submits once per turn sequence, the folder ignores a slower tab load that a newer choice has replaced, and delete can't be confirmed twice.

## The building and its documents

- `BuildingProvider` holds the 3D office's state. `heldMachine.ts` is the single object being held (ledger, clipboard, reports folder or notepad), and `Liftable` flies it to the camera.
- `StationLayer` is the DOM over the canvas:
  - `stationLayout.ts` holds its routing rules: path → layout, and path → held object.
  - `stationEffects.ts` holds its effects: heading focus, held sync, desk actions, camera inset.
- The held documents are fixed-size pages turned by `components/ui/book-slider.tsx` (react-pageflip):
  - the ledger book (`desk/Ledger.tsx`);
  - the setup clipboard (`setup/SetupForm.tsx`);
  - the reports folder (`desk/ReportsFolder.tsx`).
- Long content is measured off-screen and packed onto pages (`usePaginatedPages`, `lib/frontend/paginate.ts`), so nothing scrolls inside a page.

## Where things go

- **A new API route:** use `lib/http.ts` for the shared answers, put the workflow in `lib/interview` with its storage passed in, and add a `route.test.ts` beside it that pins every status and body. `lib/testing/fake-supabase.ts` scripts the database.
- **A new call from the browser:** add a function to `lib/frontend/api.ts` returning a typed outcome; components never call `fetch` on the app's own API.
- **New rows for a page:** add a loader beside the existing ones, taking a `RowReader` (`lib/supabase/reader.ts`) so it works with either client and can be tested with the fake.
- **A new held document:** compose `BookSlider`, `DocumentPage` and `DocumentParts`, and give it a page plan in `lib/frontend` with tests.

## Tests

`npm test` runs everything (vitest, Node, no network):
- the engine harness;
- the pipelines over in-memory stores (`lib/interview/*.test.ts`);
- every API route's HTTP contract (`src/app/api/**/route.test.ts`);
- the loaders over the fake database;
- the pure planners.

Also run `npm run typecheck`, `npm run lint` and `npm run build` before shipping.
