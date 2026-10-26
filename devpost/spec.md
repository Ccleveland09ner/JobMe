---
doc: spec
status: draft
---

# JobMe — Technical Spec

## How This Works, In Plain Language
JobMe is one Next.js website with a small server built in, and Supabase as its database and sign-in.

- The **browser** does the hearing, the speaking and the drawing. Chrome's built-in speech recognition turns your voice into text. The recruiter's voice plays through an audio element, and her lips move in time with it. The office is a 3D scene drawn with three.js.
- When you send an answer, the browser sends the **text** (never audio) to the server route `/api/sessions/[id]/turns`. That route:
  1. asks Gemini to **score** the answer on the dimensions that fit the question and to **draft** two possible follow-ups (one going deeper, one asking for what's missing);
  2. works out the band and the gap in code, then runs the **engine** — plain TypeScript, no AI — which decides the next move: clarify, deepen, next topic, or wrap up;
  3. saves the answer and the engine's new state to Supabase in one step;
  4. returns the notepad entry and the next question.
- The browser shows the notepad entry and asks `/api/tts` to speak the next question. That route calls ElevenLabs with a key the browser never sees; if it fails, the browser's own voice speaks.
- The **report** is written once at the end — one more AI call for the summary, feedback and the rewritten weakest answer — and saved, so it loads instantly afterwards.

**Why this shape:** the AI never runs the interview. It only grades and phrases. Every session stays bounded (Quick: up to 10 questions; Full: 8–30), the engine can be tested with scripted answers, and the demo is repeatable. One app and one database keep it to one deploy and one set of keys.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.

1. **Street.** `/` renders the street station of the persistent building (`src/app/(building)/layout.tsx` → `BuildingCanvas`). The sky and street sounds come from the clock (`sky/timeOfDay.ts`, `sky/sounds.ts`). **Step inside** moves the camera to the entrance.
2. **Sign in.** `/login` signs in or signs up with Supabase Auth (email and password). Sign-up checks `username_available`; the `handle_new_user` trigger creates the `profiles` row with a username and a member code. `src/proxy.ts` refreshes the session cookie on page requests.
3. **Front desk.** `/dashboard` is the desk station. `ReceptionistProvider` asks whether the visitor is new or returning (`receptionist/visitor.ts`: the account's `jobme_welcomed_at` metadata, or any past interview) and plays one recorded greeting with its bubble and lip-sync. `LobbyMusic` waits for her.
4. **Setup.** `/interview/new` lifts the setup clipboard (`setup/SetupForm.tsx`). A résumé goes to `POST /api/resume`, which extracts, redacts, chunks, embeds and distils it into facts and coverage items. **Begin** calls `POST /api/sessions` with the display name, mode and job details.
5. **Session start.** `startInterview` (`lib/interview/start.ts`) fetches a posting link if given, infers the role family and seniority (`engine/roles.ts`), takes the family's default topics, and makes one time-boxed plan call (`ai/question-plan.ts`) that may re-choose and re-word them for the job. It saves `interview_sessions` with `engine_state` and `question_plan`, and returns the session id and opening line.
6. **Room load.** `/interview/[id]` loads the session and its turns through RLS (`loadRoom`). A finished session goes to its report; otherwise the room resumes at the current question with the notepad history rebuilt.
7. **Ask.** `useRoomSpeech` calls `/api/tts` (ElevenLabs "with-timestamps", so lip-sync can follow each character) and the 3D recruiter's rig (`room/recruiterRig.ts`) moves her mouth. On failure it falls back to `speechSynthesis`.
8. **Answer.** `useVoiceAnswer` runs `SpeechRecognition` through `lib/voice/stt.ts`, restarting it when Chrome stops after a silence and collecting the final text. The room machine (`room/roomMachine.ts`) sends after a second click, Space, or 10 seconds with no new words. Typed mode sends on Ctrl/Cmd+Enter.
9. **Turn.** `POST /api/sessions/[id]/turns` with `{transcript, holdMs, captureMs, clientTurnSeq}` → `submitAnswer` (`lib/interview/turn.ts`):
   1. load the session, its recent turns and the résumé; reject a stale `clientTurnSeq` with 409 and the current state;
   2. under 5 words → a nudge (not scored, not counted);
   3. `evaluate` (one Gemini call, temperature 0) → `judgeAnswer` computes the weighted score, band and gap in code;
   4. `step()` in `lib/engine/policy.ts` picks the move; the question is the planned wording, the model's draft, or a bank seed;
   5. the `submit_turn` database function saves the turn and the new `engine_state` in one transaction;
   6. the route returns the notepad entry, the next question, progress and `done`.
10. **React.** `useTurnSubmission` adds the notepad entry, then the recruiter speaks the next question. When `done`, she says the wrap line and the room routes to the report.
11. **Report.** `POST /api/sessions/[id]/report` → `runReport` (`lib/interview/report.ts`) groups turns by original question, scores each by its latest evaluation, makes one Gemini call for the summary, strengths, improvements and rewrite (or builds a fallback in code), completes the session and files the report.
12. **Return.** The ledger (`desk/Ledger.tsx`) loads every interview's transcript and the trends through the ledger loaders; delete calls `DELETE /api/sessions/[id]`, which cascades to turns and the report.

## Stack

| Layer | Choice | Version | Why | Docs |
|---|---|---|---|---|
| Framework | Next.js App Router | 16.3.5 | The starter's skeleton; UI and server routes in one app | [nextjs.org/docs](https://nextjs.org/docs) |
| UI | React, TypeScript, Tailwind CSS | 19.2.8, ^5, ^4 | Starter defaults | [react.dev](https://react.dev), [tailwindcss.com/docs](https://tailwindcss.com/docs) |
| 3D | three.js, React Three Fiber, Drei, GSAP | ^0.186.1, ^9.8.1, ^10.7.9, ^3.15.0 | The office, the camera moves and the seated recruiter | [threejs.org/docs](https://threejs.org/docs/), [r3f.docs.pmnd.rs](https://r3f.docs.pmnd.rs/), [drei.docs.pmnd.rs](https://drei.docs.pmnd.rs/), [gsap.com/docs](https://gsap.com/docs/) |
| Page turning | react-pageflip | ^2.0.3 | Ledger, reports folder and clipboard pages | [github.com/Nodlik/react-pageflip](https://github.com/Nodlik/react-pageflip) |
| Auth + DB | Supabase via `@supabase/ssr`, `@supabase/supabase-js`; pgvector | ^0.12.7, ^2.116.0 | Auth, Postgres, row-level security, résumé vectors | [supabase.com/docs](https://supabase.com/docs), [pgvector](https://supabase.com/docs/guides/database/extensions/pgvector) |
| Validation | Zod | ^4.6.5 | Validates request bodies and the model's JSON | [zod.dev](https://zod.dev) |
| LLM + embeddings | Google Gemini via `@google/genai` | ^2.24.0; `gemini-3.5-flash-lite`, `gemini-embedding-001` | Free tier, JSON output, one key for both | [ai.google.dev/gemini-api/docs](https://ai.google.dev/gemini-api/docs) |
| Recruiter voice | ElevenLabs (`eleven_flash_v2_5`), browser `speechSynthesis` fallback | REST, no SDK | Fast neural voice with character timings for lip-sync; the fallback is free | [elevenlabs.io/docs](https://elevenlabs.io/docs) |
| Speech input | Web Speech API | Chrome/Edge | Free, live interim results | [MDN](https://developer.mozilla.org/docs/Web/API/Web_Speech_API) |
| PDF text | unpdf | ^1.8.1 | Server-side text extraction | [github.com/unjs/unpdf](https://github.com/unjs/unpdf) |
| Tests | Vitest, tsx | ^5.0.2, ^4.23.15 | Unit tests and scripts | [vitest.dev](https://vitest.dev) |

Verified during the build: `gemini-2.5-flash` is not available to new projects, so `gemini-3.5-flash-lite` is the default; it runs with no thinking config (a thinking budget of 0 is rejected). The free tier allows 15 requests a minute per model.

## Where It Runs and How Someone Tries It
- **Runtime:** a desktop browser (Chrome or Edge for voice; others get typed answers) and the Next.js server. Node.js 24.x (22.12+ also works). The microphone needs localhost or HTTPS.
- **Keys:** copy `.env.example` to `.env.local`. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GEMINI_API_KEY`. Optional: `TTS_PROVIDER=elevenlabs` with `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`. `SUPABASE_SERVICE_ROLE_KEY` is only for the live verification and clean-up scripts.
- **Database:** apply every file in `supabase/migrations/` in order (`npx supabase link --project-ref <ref>` then `npx supabase db push --linked`), enable email/password sign-in, and set the Auth Site URL to `http://localhost:3000`.
- **Start:** `npm ci`, `npm run check:db`, `npm run dev`, then open `http://localhost:3000` in Chrome.
- **Demo recording:** run locally with `TTS_PROVIDER=elevenlabs` and capture system audio so the recruiter's voice is in the video. Show the kernel: give the weak answer ("We worked as a team and fixed the bug.") and a specific answer to the same kind of question, and show the different follow-ups and the notepad entries that explain them; then the report and the ledger.
- **Sharing:** public repository at [github.com/Ccleveland09ner/JobMe](https://github.com/Ccleveland09ner/JobMe). The demo video link goes in the Devpost submission. Deployment is optional and doesn't replace the video; on a host such as Vercel, set the same variables and add the deployed URL to the Supabase Auth URL settings.

## Look and Feel
From `prd.md > Look and Feel` and `scope.md > Inspiration & Identity`.

- **Tokens** in `src/app/globals.css` (Tailwind v4 `@theme`): ground `#faf8f5`, ink `#1c1b1a`, muted `#6b6660`, accent teal `#0f766e` (pressed `#115e59`), danger `#b42318`; the office has its own named colors (wall, trim, stone, floor, wood, glass, fabric, chalkboard, notepad).
- **Scores:** every score is a bar plus its number; colors come from `components/score/levels.ts`.
- **Type:** Comic Sans with Comic Neue as the fallback (`next/font/google`), Geist Mono for quoted evidence; the 3D lettering is Comic Neue Bold converted to a three.js typeface.
- **Lighting and finishes:** one warm key light with soft shadows (`scene/Lighting.tsx`); each surface takes a named finish with a detail texture drawn in code (`three/finishes.ts`, `three/textures.ts`); no post-processing.
- **Paper:** CSS grain and a light from the upper right on held documents (`globals.css`, `ui/Clipboard.tsx`).
- **Motion:** camera moves between stations; respects `prefers-reduced-motion`.
- **Copy tone:** a warm, direct recruiter; notepad lines terse ("No measurable result → asking for impact").

## Components

### Building and Stations
The persistent 3D office. `BuildingProvider` holds its state; `stations.ts` maps a path to a station (street, entrance, desk, noteboard, corridor, room); `CameraRig` moves between them; `StationLayer` is the DOM over the canvas, with its routing in `stationLayout.ts` and effects in `stationEffects.ts`. `heldMachine.ts` tracks the one document being held.
PRD ref: `prd.md > Screens and Layout`.

### Landing Street
`building/landing/`: the tagline, the entrance sign, clickable signposts with engraved lettering, and the **Step inside** tile. `building/sky/` draws the time-of-day sky; `StreetSounds` plays day, dusk or evening sounds to match it.
PRD ref: `prd.md > The Core Journey` (step 1).

### Receptionist
`components/receptionist/`: `ReceptionistProvider` decides new or returning (`visitor.ts`), picks a line it didn't say last (`lines.ts`), plays its pre-recorded clip with per-character timings (`clips.json`, `voice.ts`) and shows the bubble (`ReceptionistBubble.tsx`). Her look is built in code over the model (`character/`). The twelve clips are generated once by `scripts/gen-receptionist-clips.ts`.
PRD ref: `prd.md > Front Desk and Receptionist`.

### Accounts and Auth
`(building)/login/` handles sign-in and sign-up; `lib/auth.ts` guards pages (redirect to `/login`) and routes (401); `lib/supabase/` holds the server, browser and session-refresh clients. Sign-out (`/logout`) returns to the entrance.
PRD ref: `prd.md > Accounts and Profile`.

### Setup Clipboard
`setup/SetupForm.tsx` with `ModeSelector`, `ResumeSelector`, `JobDescriptionField` and `MicCheck` (a `getUserMedia` level meter). It probes for speech recognition and offers typed answers when it's missing or denied. `useBeginInterview` sends Begin once.
PRD ref: `prd.md > Interview Setup`.

### Résumé Ingestion
`POST /api/resume` → `ingestResume` (`lib/resume/ingest.ts`): parse the PDF (`parse.ts`), redact (`redact.ts`), chunk (`chunk.ts`), embed, distil facts and coverage items (`distill.ts`, `items.ts`), and store the résumé and its chunks (`store.ts`). Items are ranked against the job (semantic, lexical, kind and recency).
PRD ref: `prd.md > Interview Setup`, `prd.md > Persistence and Privacy`.

### Session Start and Question Plan
`POST /api/sessions` → `startInterview`. `lib/job-posting.ts` fetches Greenhouse, Lever, Ashby or SmartRecruiters postings; `engine/roles.ts` gives the role family, seniority and default topics (Quick: 4, Full: 6); `ai/question-plan.ts` tailors them, and `repairTopics` keeps motivation first and a role question. Without the model, the defaults plus the job are used, and the opening line says so.
PRD ref: `prd.md > Adaptive Engine`.

### Interview Room
`room/InterviewRoom.tsx` wires the phase machine (`roomMachine.ts`) to `useVoiceAnswer`, `useRoomSpeech` and `useTurnSubmission`. Children: `Recruiter3D` / `RecruiterStage` (with the SVG `Avatar` as fallback), `Captions`, `PushToTalk`, `LiveTranscript`, `ProgressPill`, `HeldNotepad` with `NotepadEntry`, and `EndInterviewDialog`.
PRD ref: `prd.md > Interview Room: Voice Loop`.

### Speech Input
`lib/voice/stt.ts` and `sttMachine.ts`: continuous recognition with interim results, restarted when Chrome stops on silence, finals concatenated; returns the text with hold and capture times.
PRD ref: `prd.md > Interview Room: Voice Loop`.

### Recruiter Voice and Lip-sync
`GET /api/tts` requires a user, caps text at 600 characters and proxies ElevenLabs (`stream` or `with-timestamps`). `lib/voice/tts.ts` plays it, `lipsync.ts` turns character timings into mouth shapes, and `audio-graph.ts` handles Web Audio. Errors fall back to `speechSynthesis`.
PRD ref: `prd.md > Interview Room: Voice Loop`.

### Turn Pipeline
`app/api/sessions/[id]/turns/route.ts` → `submitAnswer` / `runTurn` in `lib/interview/turn.ts`, as in the core journey, step 9. The route maps each outcome (saved, nudge, stale, finished, not found, failed) to a status.
PRD ref: `prd.md > Adaptive Engine`.

### Evaluator
`lib/ai/evaluate.ts` with the rubric and fairness rules in `ai/prompts.ts`. One call returns the scores for the question's kind, a status (complete, incomplete, incorrect, off topic, no experience), evidence, an observation, the clarify gap and two drafts; Zod validates it. A follow-up is scored together with the original answer against the original question.
PRD ref: `prd.md > Adaptive Engine`, `prd.md > Recruiter's Notepad`.

### Adaptive Engine
`lib/engine/`, pure and unit-tested, importing nothing outside itself:
- `types.ts`: topics, question kinds, dimensions, weights, caps (`QUICK_QUESTION_CAP = 10`, full mode 8–30).
- `classify.ts`: bands — weak below 2.0 or off-topic; great at 3.5+ with no dimension below 3 (communication excepted); mediocre otherwise. Shown as Needs work, Strong, Developing.
- `policy.ts`: `step(state, evaluation)` → next state, move and question. Resolves a topic on no experience, plateau, a strong deepen, two weak answers, or the follow-up limit (2; 1 for motivation and full-mode résumé threads). Difficulty rises after a strong thread (max 3).
- `bank.ts`, `topics.ts`, `roles.ts`, `opening.ts`: the question bank, topic labels, role families and the greeting.
- `notepad.ts`: the deterministic reason line, so it always matches the move.
PRD ref: `prd.md > Adaptive Engine`.

### Recruiter's Notepad
`room/HeldNotepad.tsx` and `NotepadEntry.tsx`: scores as bars with numbers (`components/score/`), band, gap, evidence, observation and reason; earlier entries kept on its pages.
PRD ref: `prd.md > Recruiter's Notepad`.

### Report Generator
`POST /api/sessions/[id]/report` → `runReport` (`lib/interview/report.ts`) with `ai/report.ts`. Idempotent: an existing report is returned. Quotes in strengths are checked to be the candidate's own words (`verifyQuote`); invented numbers in the rewrite are replaced with placeholders. If the model fails, the summary and improvements are built from the scores.
PRD ref: `prd.md > Report`.

### Reports Folder
`desk/ReportsFolder.tsx` and `ReportSheets.tsx` map each report block in `components/report/` onto pages; tabs change the URL, and Back and Forward follow it.
PRD ref: `prd.md > Report`.

### Ledger
`desk/Ledger.tsx` and `LedgerPages.tsx`: transcripts threaded by question (`questionThreads` in `lib/stats.ts`), trends over the latest 20 completed interviews, resume and delete (`useDeleteSession`).
PRD ref: `prd.md > Ledger and Progress`.

### Settings and Background Audio
`/settings` and `components/settings/` for the display name and browser-saved defaults (`lib/frontend/preferences.ts`). `LobbyMusic` and `StreetSounds` play through `backgroundAudio.ts`: quiet looping playlists, faded and cross-faded, silent while the microphone test runs or the tab is hidden, and only after the first click or key press.
PRD ref: `prd.md > Front Desk and Receptionist`.

## Data Model
Postgres in Supabase, created by `supabase/migrations/`. Row-level security on every table: each row is read and written only by its owner (`auth.uid() = user_id`; on `profiles`, `= id`).

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id`, `display_name`, `target_role`, `username`, `member_code` | Created by the `handle_new_user` trigger |
| `interview_sessions` | `id`, `user_id`, `status`, `question_count`, `engine_state` (jsonb), `question_plan` (jsonb), `role_text`, `job_url`, `resume_id`, `overall_scores`, `started_at`, `ended_at` | `engine_state` is the live source of truth |
| `turns` | `session_id`, `seq`, `topic`, `question_type`, `question_source`, `difficulty`, `question_text`, `answer_transcript`, `scores` (null = unscored), `band`, `primary_gap`, `evidence`, `notepad_text`, `reason_text`, `wpm`, `filler_count`, `hold_ms`, `capture_ms`, `degraded_reason` | Written only by `submit_turn` |
| `reports` | `session_id` (primary key), `summary`, `weakest_turn_id`, `rewrite_text`, `stats` (incl. feedback) | Filed once per session |
| `resumes` | `id`, `redacted_text`, `resume_facts`, `role_profile`, `coverage_items`, `redaction_report` | No PDF stored |
| `resume_chunks` | `resume_id`, `seq`, `section`, `content`, `embedding` (768 dims) | Searched with `match_resume_chunks` |

**`EngineState`** (`interview_sessions.engine_state`): mode, chosen topics and index, difficulty, follow-ups used, last move and band, the current thread's scores, question count and cap, turn sequence (for idempotent submits), the current question, asked questions, résumé items with coverage, and `done`.

**Where data lives, and what happens on return:**
- Session and engine state live in Postgres and change on every turn, so a refresh resumes where it was.
- Turns live in Postgres; the notepad history and the ledger are rebuilt from them.
- An answer in progress lives only in the browser; a refresh mid-answer loses that one answer.
- Preferences (defaults, lobby music) live in this browser's local storage. Whether the receptionist has met you lives in your account's auth metadata.
- Audio is never stored.

## File Structure

```
JobMe/
├── devpost/                      # Learn Skill Pack workspace: scope.md, prd.md, spec.md
├── docs/                         # original PRD and tech design, architecture, scoring rubric, notes
├── data/bank-embeddings.json     # placeholder for bank vectors (not used by the live flow)
├── design/tools/                 # rebuilds the recruiter model and the 3D typeface
├── public/
│   ├── models/recruiter.glb      # the recruiter (see THIRD_PARTY_NOTICES.md)
│   ├── fonts/                    # Comic Neue Bold as a three.js typeface
│   └── audio/                    # music/, sound/ (street), receptionist/
├── scripts/                      # probes, rehearsal, calibration, live verify, clip generation
├── supabase/migrations/          # schema, RLS, grants, database functions
├── src/
│   ├── proxy.ts                  # refreshes the auth cookie on page requests
│   ├── app/
│   │   ├── (building)/           # pages sharing the persistent office scene
│   │   │   ├── layout.tsx        # the building canvas and station layer
│   │   │   ├── page.tsx          # street
│   │   │   ├── login/            # entrance: sign in / sign up
│   │   │   ├── dashboard/        # front desk, ledger
│   │   │   ├── interview/new/    # setup clipboard
│   │   │   ├── interview/[id]/   # interview room, report/
│   │   │   ├── reports/          # reports folder
│   │   │   └── settings/
│   │   ├── api/
│   │   │   ├── resume/           # POST: ingest a PDF
│   │   │   ├── sessions/         # POST: start; [id] DELETE; [id]/turns POST; [id]/report POST
│   │   │   └── tts/              # GET: ElevenLabs proxy
│   │   ├── dev/                  # recruiter, book and receptionist previews (404 in production)
│   │   └── logout/
│   ├── components/
│   │   ├── building/             # state, camera, stations, landing/, scene/, sky/, audio
│   │   ├── receptionist/         # Ms. Crystal: lines, clips, visitor status, character
│   │   ├── room/                 # interview room, recruiter, captions, mic, notepad
│   │   ├── setup/                # clipboard sheets, mode, résumé, job, mic check
│   │   ├── desk/                 # ledger and reports folder
│   │   ├── report/               # report blocks
│   │   ├── score/                # score bars and colors
│   │   ├── three/                # finishes, textures, lettering
│   │   └── ui/, common/, held/, settings/, dashboard/, layout/
│   └── lib/
│       ├── engine/               # pure interview policy (no I/O)
│       ├── interview/            # start, turn and report workflows
│       ├── ai/                   # Gemini adapter, evaluator, question plan, report, embeddings
│       ├── resume/               # parse, redact, chunk, distil, rank, store
│       ├── jd/                   # job-description distillation
│       ├── voice/                # speech recognition, voice output, lip-sync
│       ├── frontend/             # loaders, typed API client, preferences, layout helpers
│       ├── supabase/             # clients and session refresh
│       ├── auth.ts, http.ts, schemas.ts, stats.ts, plan.ts, job-link.ts, job-posting.ts
│       └── architecture.test.ts  # fails the tests if a layer rule breaks
├── .env.example
└── package.json
```

## External Services and Dependencies

| Service | Call | Keys | Limits and cost |
|---|---|---|---|
| **Supabase** | `@supabase/ssr` server and browser clients; Auth (email/password); Postgres through PostgREST; RPCs `submit_turn`, `match_resume_chunks`, `username_available` | publishable key + the user's cookie | Free tier; projects pause after inactivity, so wake it before recording |
| **Gemini — generate** | `ai.models.generateContent({ model: LLM_MODEL, contents, config: { systemInstruction, responseMimeType: "application/json", responseSchema, temperature } })` for evaluation (temperature 0), the question plan, résumé distillation and the report | `GEMINI_API_KEY` (server only) | Free tier: 15 requests/minute per model (measured); a 429 takes the degraded-turn path. Free-tier prompts may be used to improve Google products |
| **Gemini — embed** | `ai.models.embedContent({ model: EMBED_MODEL, contents, config: { taskType, outputDimensionality: 768 } })` | same | Same key and quota |
| **ElevenLabs** | `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/{stream \| with-timestamps}?output_format=mp3_22050_32`, header `xi-api-key`, body `{ text, model_id: "eleven_flash_v2_5" }` | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (server only) | Free tier is small (one interview is roughly 1.5k characters); use `TTS_PROVIDER=browser` while developing |
| **Job postings** | `boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}`, `api.lever.co/v0/postings/{site}/{id}`, `api.ashbyhq.com/posting-api/job-board/{org}`, `api.smartrecruiters.com/v1/companies/{company}/postings/{id}` | none (public) | Public job-board APIs |
| **Web Speech API** | `new (window.SpeechRecognition \|\| window.webkitSpeechRecognition)()` | none | Chrome may send audio to Google for recognition; setup says so |
| **Google Fonts** | `next/font/google` at build time | none | Builds need network access to download fonts |

## Important Failure Modes
- **Gemini slow, invalid or rate-limited** → a bounded retry, then rules keep the conversation moving; the turn is saved as unscored and left out of averages.
- **Question plan fails** → the role family's default topics and fixed openings; the recruiter says job details couldn't be used.
- **ElevenLabs error or quota** → `speechSynthesis` speaks the same text; captions are unaffected.
- **Speech recognition unavailable, denied or failing** → typed answers with the same engine and notepad.
- **Double submit or a flaky network** → the stale `clientTurnSeq` gets a 409 with the current state; `submit_turn` writes nothing twice.
- **Report text fails** → the report is filed with a summary and improvements built from the scores.

## What Was Simplified and Why
- **Next.js route handlers** instead of a separate Python API — one codebase, one deploy, one set of keys. The fuller version would add a second service and JWT checks in Python.
- **One evaluation call per turn** that scores and drafts both follow-ups — the engine still picks the move, and the turn needs one round trip. The fuller version would generate the question after the move is chosen.
- **Engine state as jsonb in Postgres** — refresh-safe and serverless-safe without a separate state store.
- **Browser speech recognition plus typed answers** instead of a server speech-to-text service — no upload, no extra cost. The fuller version would add a Whisper-class service for other browsers.
- **Recorded receptionist clips** instead of live speech — her twelve lines are fixed, so they're generated once and cost nothing per visit.
- **Browser voice during development, neural voice for demo takes** — keeps the voice inside the free tier.

## Decisions and Open Issues

**Decisions**
- **The engine owns the flow; the AI scores and phrases.** Tradeoff: follow-ups are drafted before the move is known, so the model drafts both options.
- **A rubric by question kind, not STAR dimensions** (`docs/Scoring-Rubric.md`). An audit found voice answers banded weak for their format: Chrome's transcripts have no capitals or punctuation, STAR order was being scored, and numbers were effectively required. Tradeoff: scores from before the change keep their old labels, and per-dimension trends start fresh.
- **Gemini free tier.** Tradeoff: the free tier's data-use terms and 15 requests a minute; the adapter (`lib/ai/llm.ts`) is the only file that knows the provider.
- **A 3D office with a 2D fallback.** Tradeoff: more to build and test; the flat recruiter and desk buttons keep JobMe usable without the scene.
- **Email and password with usernames** instead of the starter's email codes.

**The useful unknown:** *can a full turn fit the live feel on free tiers?* The plan set a gate of about 1.1 s median for evaluation. `npm run probe` (`scripts/latency-probe.ts`) settled the model choice: `gemini-3.5-flash-lite` with no thinking config was the fastest option, at about 1 s with no thinking tokens. Per-turn timings are logged from `after()` for ongoing checks.

**Open issues**
- **Garbled transcripts** still score 0.5–0.7 below their clean twins when the job context names a company (`docs/Scoring-Rubric.md > Known residual`). Proposed: clean the transcript before scoring and show the original words.
- **Parent ownership checks:** migration `20261022120000_parent_ownership_checks.sql` is written; `docs/Architecture.md` records it as not yet applied to the hosted project.
- **Unfinished utilities:** `npm run embed:bank` and `npm run gen:acks` throw; acknowledgment clips, voice prewarming and bank embedding checks aren't built. None is needed for the current flow.
- **`LLM_SURFACE`** is in `.env.example` but not an active switch; the adapter always calls `generateContent`.
