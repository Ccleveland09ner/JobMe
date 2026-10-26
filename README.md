<a id="readme-top"></a>

<!-- PROJECT HEADER -->
<br />
<div align="center">
  <h1 align="center">JobMe</h1>
  <p align="center">
    An adaptive mock interview room where the recruiter listens.
    <br />
    Voice and text practice, résumé-aware questions, and feedback you can follow.
    <br />
    <br />
    <a href="#documentation"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="#getting-started">Get Started</a>
    &middot;
    <a href="https://github.com/Ccleveland09ner/JobMe/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/Ccleveland09ner/JobMe/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#features">Features</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li><a href="#hackathon-submission">Hackathon Submission</a></li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#environment-variables">Environment Variables</a></li>
        <li><a href="#deploying-to-vercel">Deploying to Vercel</a></li>
      </ul>
    </li>
    <li>
      <a href="#usage">Usage</a>
      <ul>
        <li><a href="#interview-modes-and-scoring">Interview Modes and Scoring</a></li>
        <li><a href="#how-an-interview-works">How an Interview Works</a></li>
        <li><a href="#data-handling">Data Handling</a></li>
        <li><a href="#routes-and-api">Routes and API</a></li>
        <li><a href="#current-limits">Current Limits</a></li>
      </ul>
    </li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li>
      <a href="#contributing">Contributing</a>
      <ul>
        <li><a href="#checks-and-developer-tools">Checks and Developer Tools</a></li>
        <li><a href="#code-layout">Code Layout</a></li>
        <li><a href="#documentation">Documentation</a></li>
      </ul>
    </li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## About The Project

JobMe is a voice and text mock interview app for **behavioral SWE internship practice**. A recruiter asks follow-up questions based on your answers, while a live notepad explains the feedback and the next move.

The application includes authentication, résumé ingestion, adaptive interviews, saved sessions, scorecards, and progress tracking. Its interface is a stylized 3D office: enter from the street, pick up a setup clipboard at the front desk, sit down with the recruiter, and review your reports in a folder.

### Features

- **Accounts:** email/password sign-in and sign-up with a unique username and an assigned member code. Settings let you edit your display name and save interview/input defaults in the current browser.
- **Street and front desk:** a street outside the building with a time-of-day sky and matching street sounds, clickable signposts, and a Step inside tile. At the front desk the receptionist, Ms. Crystal, greets first-time and returning visitors and sees them off at sign-out, in a recorded, lip-synced voice with a speech bubble. Quiet lobby music plays at the desk and can be turned off.
- **Personalized setup:** choose Quick or Full, optionally upload or reuse a PDF résumé, and supply a target role, pasted job description, or supported job-posting link. Link import supports Greenhouse, Lever, Ashby, and SmartRecruiters.
- **Adaptive interviews:** questions come from a 15-topic bank and résumé roles/projects. Every interview opens with motivation, then asks the role family's own question (software, product, or data) and behavioral competencies. The engine chooses whether to clarify, deepen, move to another topic, or wrap up.
- **Voice and typed answers:** browser speech recognition, an optional microphone check, editable typed input, live transcripts/captions, and recruiter speech with animated lip-sync. Recognition failures fall back to typed input.
- **Live feedback:** the recruiter's notepad shows scores, an answer-quality band, the main gap, quoted evidence, an observation, and the reason for the next question.
- **Saved progress:** return to an unfinished interview, retry an answer after a failed request, or end early after at least one answer. The desk ledger is the record of every interview: what you were asked and what you said, question by question and word for word, with follow-ups under the question they added to.
- **Reports and trends:** each report holds the evaluation: overall and per-question scores with the interviewer's notes, a summary, what went well and what to work on, a STAR rewrite of the weakest scored answer, approximate filler counts, and voice speaking rate. The ledger points to the report for any of these, and the report to the ledger for the transcript. Trends across the latest 20 completed interviews are at the front of the ledger. An interview can be deleted from the ledger or from its report, and it leaves both.
- **3D presentation and fallbacks:** a persistent Three.js building, animated camera transitions, a seated recruiter, and interactive paper objects. Keyboard-accessible controls, reduced-motion handling, and 2D fallbacks (the desk's buttons and an SVG recruiter) support use without the full 3D scene.

### Built With

[![Next.js][next-shield]][next-url]
[![React][react-shield]][react-url]
[![TypeScript][typescript-shield]][typescript-url]
[![Tailwind CSS][tailwind-shield]][tailwind-url]
[![Three.js][three-shield]][three-url]
[![Supabase][supabase-shield]][supabase-url]

- Next.js **16.3.5**, React **19.2.8**, TypeScript, and Tailwind CSS 4.
- Three.js, React Three Fiber, Drei, and GSAP for the building and recruiter.
- Supabase Auth and Postgres, with row-level security and pgvector résumé embeddings.
- Google Gemini through `@google/genai` for evaluation, question planning, résumé processing, and report text.
- Web Speech APIs for recognition and browser speech; optional ElevenLabs speech through a server proxy.
- `unpdf` for PDF text extraction, Zod for validation, and Vitest for tests.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- HACKATHON SUBMISSION -->
## Hackathon Submission

JobMe was built for Devpost [*Build With AI: Basics*](https://learn-ai-basics.devpost.com/), which uses the [Learn Skill Pack](https://github.com/challengepost/learn-ai-basics).

| Requirement | Where |
| --- | --- |
| Scope | [`devpost/scope.md`](./devpost/scope.md): the kernel, who it's for, the core loop, and the proof-of-concept boundary. |
| Product requirements | [`devpost/prd.md`](./devpost/prd.md): the core journey, screens, behavior, states, and what was deferred. |
| Technical spec | [`devpost/spec.md`](./devpost/spec.md): the architecture, data model, file structure, external services, and failure modes. |
| Public repository | [Ccleveland09ner/JobMe][project-url] |
| Demo video | Linked from the Devpost submission. |
| Running it yourself | [Getting Started](#getting-started) |

The `devpost/` documents describe JobMe as built. The original plans they grew from are kept in [`docs/`](./docs/) (see [Documentation](#documentation)).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->
## Getting Started

Follow these steps to run JobMe against your own Supabase project and AI service credentials.

### Prerequisites

Use **Node.js 24.x** and npm. The current test toolchain also supports Node 22.12+ in the 22.x release line, but Node 20 does not satisfy all installed dependencies. Voice input targets Chrome/Edge; typed answers are available when speech recognition is unsupported. Microphone access needs localhost or HTTPS and browser permission.

You will also need Git, a Supabase project, and a Gemini API key. ElevenLabs credentials are optional.

### Installation

#### 1. Clone the repository

```bash
git clone https://github.com/Ccleveland09ner/JobMe.git
cd JobMe
```

#### 2. Install and configure

```bash
npm ci
```

Copy [`.env.example`](./.env.example) to `.env.local` and fill in the Supabase connection values and Gemini API key. On PowerShell:

```powershell
Copy-Item .env.example .env.local
```

All application dependencies are already declared in `package.json`; no extra package installation or UI initialization step is needed. If PowerShell blocks `npm.ps1`, use `npm.cmd` (and `npx.cmd`) for the commands below.

#### 3. Prepare Supabase

Create a Supabase project and apply **all** files in [`supabase/migrations/`](./supabase/migrations/) in timestamp order. Using the [Supabase CLI](https://supabase.com/docs/reference/cli/supabase-db-push):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --linked
```

These commands apply the migrations to the linked project. The latest migration, `20261016120000_usernames_and_member_codes.sql`, supplies the username/member-code fields and availability check used by sign-up; applying only the original schema is insufficient.

Enable email/password authentication and configure the Auth Site URL for your app (`http://localhost:3000` during development). If email confirmation is enabled, users confirm their email and then return to sign in. See [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords) for the project settings. The checked-in magic-link template is a legacy artifact; the current login screen does not use OTP codes.

The migrations create six application tables: `profiles`, `interview_sessions`, `turns`, `reports`, `resumes`, and `resume_chunks`, with RLS, grants, and the required database functions. No Supabase Storage bucket is needed for résumé PDFs.

#### 4. Start the app

```bash
npm run check:db
npm run dev
```

Open [localhost:3000](http://localhost:3000), create an account, and start an interview from the front desk. `check:db` checks Auth connectivity and table access; it does not validate every column or database function.

For a production build:

```bash
npm run build
npm start
```

Configure the same environment variables on the deployment host and update the Supabase Site URL; for Vercel, see [Deploying to Vercel](#deploying-to-vercel). Font loading uses `next/font/google`, so builds need access to the Google font downloads. The committed recruiter model runs as-is; Blender is only needed to rebuild that asset.

### Environment Variables

| Variable | Use |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Required Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Required public client key. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a legacy alternative; set one of them. |
| `GEMINI_API_KEY` | Server-side key for scoring, personalization, résumé processing, and report text. |
| `LLM_MODEL` | Defaults in code to `gemini-3.5-flash-lite`. Override for the model available to your project and verify it with the probe scripts. |
| `EMBED_MODEL` | Defaults to `gemini-embedding-001`; résumé embeddings use 768 dimensions. |
| `TTS_PROVIDER` | Use `browser` for browser speech, or `elevenlabs` to enable the neural voice proxy. |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Required only for ElevenLabs speech. |
| `SUPABASE_SERVICE_ROLE_KEY` | Used only by privileged live verification/cleanup scripts. Normal application requests use the signed-in user's client and RLS. |
| `LLM_SURFACE` | Present in the example environment, but not an active switch: the adapter currently always calls `generateContent`. |

Only the `NEXT_PUBLIC_*` values belong in the browser. Keep service-role, Gemini, and ElevenLabs keys server-side. Some comments in `.env.example` predate the current auth and maintenance scripts; the table above describes actual usage.

### Deploying to Vercel

JobMe deploys to [Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs) as a standard Next.js project; no `vercel.json` is needed. `package.json` pins Node.js 24.x, and the slower routes (starting a session, processing a résumé, filing a report) allow up to 30 seconds through `maxDuration`.

1. **Import the repository.** Add a new Vercel project from `Ccleveland09ner/JobMe`, keeping the detected Next.js framework and the default install and build commands.
2. **Set the environment variables before the first deploy** (Settings → Environment Variables, for Production and, if you use them, Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `GEMINI_API_KEY`; for the neural voice, also `TTS_PROVIDER=elevenlabs`, `ELEVENLABS_API_KEY`, and `ELEVENLABS_VOICE_ID`. Leave `SUPABASE_SERVICE_ROLE_KEY` out; the app never uses it. The build succeeds without these values, but nobody can sign in, and because `NEXT_PUBLIC_*` values are compiled into the browser code at build time, changing them later needs a redeploy.
3. **Deploy, then point Supabase at the new domain.** In Supabase, under Authentication → URL Configuration, set the Site URL to your deployment (`https://<your-project>.vercel.app` or a custom domain) and add it to the Redirect URLs. Sign-up confirmation emails link to the Site URL.
4. **Try it.** Open the deployment in Chrome, create an account, and run a short interview. The microphone works because Vercel serves HTTPS.

Vercel caps a function's request body at 4.5 MB; résumé uploads are capped at 4 MB, so they fit. Each answer makes several database calls, so choose the Vercel Functions region (Settings → Functions) nearest your Supabase project. Free Supabase projects pause after a week of inactivity; wake the project before a demo. The `/dev` previews return 404 in production.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE -->
## Usage

1. Enter the building and create an account or sign in with your email and password.
2. At the front desk, open the setup clipboard and choose Quick or Full. Add your résumé and target job if you want personalized questions.
3. Complete the optional microphone check, or choose typed answers, then start the interview.
4. Answer the recruiter and open the notepad to review feedback. You can leave and continue the saved session later, or end early after one answer.
5. Read your scorecard, feedback and rewrite in the reports folder, and everything you said in the desk ledger. Return to the ledger to resume sessions or compare trends; delete an interview from either the ledger or its report.

### Interview Modes and Scoring

| Mode | Current behavior |
| --- | --- |
| Quick | Up to 10 questions, starting from four topics (motivation, the role's own question, then behavioral competencies), with résumé questions mixed in when available. |
| Full | A résumé-derived budget of 8 to 30 questions. Prioritizes coverage of up to 10 ranked résumé items, with a limited bank-question budget. Without a résumé, uses general behavioral questions. |

Full mode trims résumé items beyond its coverage budget; it does not promise to cover every item on an arbitrarily long résumé. Sessions can finish before their cap, and users can end early.

Answers are scored from 1–4 on the dimensions that fit the kind of question, each kind with its own weights:

| Kind | Dimensions |
| --- | --- |
| Behavioral and résumé stories | Relevance, Specific evidence, Own contribution, Reasoning, Outcome, Clarity |
| Technical and problem solving | Relevance, Accuracy, Reasoning, Specific evidence, Clarity |
| Motivation | Relevance, Specific evidence, Reasoning, Clarity |

An answer is banded **Needs work** (weighted score below 2.0, or off-topic), **Strong** (3.5 or above with no dimension below 3, Clarity excepted), or **Developing**. A follow-up adds to the original answer, so each question is scored by its latest, most complete evaluation. STAR and numbers are never required, and grammar, accent, and filler words are never penalized. The [scoring rubric](./docs/Scoring-Rubric.md) has the weights and the reasons for them. Sessions scored before the rubric changed keep their original STAR dimensions. Feedback is for practice, not a prediction of a hiring outcome.

### How an Interview Works

The deterministic engine owns the conversation flow. Gemini scores answers and supplies wording; it does not choose the next move.

1. **Prepare context.** A résumé upload is parsed, redacted, chunked, embedded, and distilled into facts and coverage items. A pasted job description can inform résumé ranking at upload time. A supported posting URL is fetched when the session starts; reusing a résumé or importing a link does not rerank its stored coverage items.
2. **Plan openings.** Session creation selects bank topics and, when context is available, makes a bounded model call to prepare personalized openings. Those openings are saved with the session; fixed bank/résumé prompts are the fallback.
3. **Capture an answer.** Click the microphone or press Space to start and send. Voice input also submits after 10 seconds without recognized-text changes. Typed input supports Ctrl/Cmd+Enter. The microphone is disabled while the recruiter speaks.
4. **Evaluate and decide.** The turn pipeline normally makes one evaluation call with the current question, answer, and thread context, with a bounded retry for some failures. Code computes the band, primary gap, and quoted evidence; the pure engine decides the next move and enforces follow-up and session limits.
5. **Persist before replying.** The `submit_turn` database function writes the answer and updated engine state atomically. Sequence checks reject stale or duplicate submissions. `after()` is used for timing telemetry, not answer persistence.
6. **Review.** Report generation computes aggregates from scored turns, generates a summary/rewrite when possible, and saves the report for subsequent visits.

If evaluation times out or fails, heuristics keep the conversation moving, but the turn is saved as **unscored** and excluded from averages. Failed question planning uses fixed openings. Failed report text generation still produces a scorecard without a rewrite. ElevenLabs failures fall back to browser speech, with captions available in the room.

Embeddings currently support résumé processing/retrieval helpers; the active turn pipeline does not embed every answer or perform per-turn résumé retrieval.

### Data Handling

JobMe sends answer transcripts to Gemini and stores transcripts, scores, engine state, and reports in Supabase. It does not upload or store candidate microphone audio itself; the browser's speech-recognition service may process audio remotely, as disclosed during setup.

Whether the receptionist has greeted you before is kept in your account's auth metadata; interview defaults and the music setting are kept in this browser.

Résumé PDFs are uploaded for server-side extraction but are not retained. The app applies pattern-based redaction before sending extracted résumé text to AI services or storing it, and retains redacted text, facts, coverage items, and vectors. This redaction is not a guarantee of anonymity, and answer transcripts do not pass through the résumé redactor. Deleting a session also deletes its turns and report; saved résumés are separate records.

### Routes and API

| Route | Purpose |
| --- | --- |
| `/` | Street landing; signed-in users continue to the desk. |
| `/login` | Sign-in and account creation. |
| `/dashboard` | Front desk; `?open=ledger` opens the ledger: each interview's transcript, your progress and trends. `&entry=<id>` opens it at one interview. |
| `/interview/new` | Setup clipboard, résumé/job context, and microphone check. |
| `/interview/[id]` | Current interview and live notepad. |
| `/interview/[id]/report` | A session's report: scorecard, feedback and rewrite. |
| `/reports` | Latest completed report, with navigation between reports. |
| `/settings` | Account details and browser-saved defaults. |

API handlers authenticate their own requests:

| Method and endpoint | Purpose |
| --- | --- |
| `POST /api/resume` | Ingest a PDF résumé. |
| `POST /api/sessions` | Create an interview and its question plan. |
| `POST /api/sessions/[id]/turns` | Evaluate and atomically save an answer. |
| `POST /api/sessions/[id]/report` | Generate or return the saved report; supports ending early. |
| `DELETE /api/sessions/[id]` | Delete a session and its dependent turns/report. |
| `GET /api/tts` | ElevenLabs proxy, including optional character alignment for lip-sync. |

Development-only previews are available at `/dev/recruiter`, `/dev/receptionist`, `/dev/book`, and `/dev/building/[station]` (`street`, `entrance`, `desk`, `noteboard`, `corridor`, or `room`). They return 404 in production. The book preview is a layout/interaction workbench.

### Current Limits

- Interviews are behavioral at their core, tailored to the role family (software, product, data, or general) inferred from the job title. There is no coding-exercise runner or track selector.
- Résumé uploads must be text-based PDFs under 4 MB. There is no OCR path for scanned résumés; suspicious layouts require review of extracted text.
- Voice input uses browser recognition. Silence submission is based on transcript inactivity, not voice-activity detection, and barge-in is not implemented.
- Posting imports are limited to the four supported providers; other jobs can be supplied as pasted text.
- Google sign-in, password-reset/account-deletion screens, report sharing/export, and spoken report rewrites are not implemented.
- Bank-anchor embedding checks, generated acknowledgment clips, and TTS prewarming remain unfinished. External service availability and quotas affect scoring, résumé ingestion, and generated speech.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ROADMAP -->
## Roadmap

The checked items are implemented. Open items below reflect unfinished work already identified in the codebase.

- [x] Email/password accounts, usernames, and member codes.
- [x] Quick and Full adaptive interviews with résumé and job context.
- [x] Voice and typed answers, live notes, and the 3D office/recruiter.
- [x] Saved sessions, scorecards, transcripts, and progress trends.
- [ ] Complete bank embedding generation and calibrate anchor checks.
- [ ] Implement acknowledgment-clip generation.
- [ ] Add TTS prewarming.
- [ ] Add narration for report rewrites.

Use [project issues][issues-url] to report problems or propose further work.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->
## Contributing

Propose a change through [project issues][issues-url] or a pull request. For an implementation change:

1. Create a branch in your fork or checkout.
2. Make the change and include relevant validation.
3. Run the appropriate checks below.
4. Open a pull request explaining the behavior, validation, and any remaining limitations.

Read [AGENTS.md](./AGENTS.md) before changing code. For Next.js changes, consult the installed version's guides in `node_modules/next/dist/docs/`. Keep the interview policy deterministic, preserve RLS ownership checks, and keep API secrets server-side.

### Checks and Developer Tools

```bash
npm test                 # Unit tests; no browser or live services
npm run test:watch
npm run lint
npm run typecheck
npm run build
npm run rehearse         # Offline interview simulation with scripted evaluation
npm run measure          # Offline full-mode pacing simulation
```

Tests cover the engine, turn/report orchestration, question plans, résumé helpers, job-link parsing, voice state machines/lip-sync, and frontend state/layout utilities. They do not replace a browser walkthrough or a live service check.

| Command | Requirements and effects |
| --- | --- |
| `npm run check:db` | Read-only Supabase connectivity/table checks. |
| `npm run probe` | Live Gemini latency/model/embedding probes; also probes ElevenLabs when configured. Consumes API quota. |
| `npm run probe:eval` | Live evaluator smoke tests; `PROBE_RUNS` controls repetitions. |
| `npm run rehearse -- --live` | Adds a real Gemini run to the rehearsal. |
| `npm run verify:live` | Requires a running app and service-role key. Creates a test user, uploads a résumé, runs an interview, and leaves test data. Supports `-- --quick`. |
| `npm run cleanup:test -- --dry-run` | Preview matching test users/data. Omitting `--dry-run` deletes those records using the service-role key. |

Live verification accepts `VERIFY_BASE_URL`, `VERIFY_PDF`, and `VERIFY_MAX_TURNS`. Its default PDF fixture is not included in the repository, and some assertions expect that fixture's specific résumé facts; review the script before using another PDF.

`npm run embed:bank` and `npm run gen:acks` are unfinished utilities that currently throw. `data/bank-embeddings.json` is still a placeholder; none of these is required for the current interview flow.

### Code Layout

```text
src/app/(building)/       Pages sharing the persistent office scene
src/app/api/              Authenticated route handlers
src/app/dev/              Recruiter and book previews
src/components/building/  Building state, camera, stations, and 3D scenes
src/components/room/      Interview controls, recruiter, captions, and notepad
src/components/desk/      Session ledger and reports folder
src/components/receptionist/  Front-desk receptionist: lines, recorded clips, visitor status
src/components/           Setup, reports, settings, charts, and shared UI
src/lib/engine/           Pure interview policy, topic bank, scoring types
src/lib/interview/        Turn and report orchestration
src/lib/ai/               Gemini adapter, evaluation, planning, embeddings
src/lib/resume/           PDF parsing, redaction, chunking, ranking, storage
src/lib/jd/               Job-description distillation
src/lib/voice/            Recognition, synthesis, and lip-sync
src/lib/frontend/         Adapters, preferences, pagination, and UI state helpers
src/lib/supabase/         Cookie/browser clients and session refresh
src/proxy.ts              Page-request auth-cookie refresh
supabase/migrations/      Schema, RLS, grants, and database functions
scripts/                  Local simulations, service probes, maintenance tools
public/                   Recruiter model, audio, and 3D font data
design/tools/             Recruiter asset rebuild tools
devpost/                  Hackathon planning documents: scope, PRD, spec
docs/                     Original plans and implementation notes
```

### Documentation

- [Scope](./devpost/scope.md), [product requirements](./devpost/prd.md), and [technical spec](./devpost/spec.md) describe JobMe as built; they are the hackathon's planning documents.
- [Architecture](./docs/Architecture.md) covers the layers and their import rules, request flows, data integrity, and where new code goes. The [scoring rubric](./docs/Scoring-Rubric.md) covers how answers are scored, how questions are chosen, and how feedback is written.
- The original [product requirements](./docs/PRD-JobMe-MVP.md), [technical design](./docs/TechDesign-JobMe-MVP.md), and [backend implementation brief](./docs/Backend-Implementation-Brief.md) are historical planning documents. They contain superseded scaffold, auth, scoring, and pipeline details; use the current source and this README for implemented behavior.
- [October 5 migration note](./docs/Migration-Note-2026-10-05.md) explains résumé coverage, ranking, and PDF extraction changes.
- [Recruiter asset tools](./design/tools/README.md) describe rebuilding the avatar; [third-party notices](./THIRD_PARTY_NOTICES.md) cover the bundled model, animation, and lettering assets.
- [AGENTS.md](./AGENTS.md) contains repository instructions. Before changing Next.js code, read the relevant guides in `node_modules/next/dist/docs/` for this installed version.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->
## License

Distributed under the MIT License. See [LICENSE](./LICENSE). Bundled third-party assets keep their own licenses; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->
## Contact

GitHub: [@Ccleveland09ner](https://github.com/Ccleveland09ner)

GitHub: [@Chibela](https://github.com/Chibela)

Project: [Ccleveland09ner/JobMe][project-url]

Questions and bug reports: [project issues][issues-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

Originally built for Devpost *Build With AI: Basics*.

- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) — the format used for this README.
- [maxMyers13/hackathon-app](https://github.com/maxMyers13/hackathon-app) — the application starter.
- [challengepost/learn-ai-basics](https://github.com/challengepost/learn-ai-basics) — the project process.
- TalkingHead sample avatars, Adobe Mixamo animation, Comic Neue lettering, react-pageflip, lobby music from Free To Use, and the receptionist's ElevenLabs voice — see [third-party notices](./THIRD_PARTY_NOTICES.md).
- [Shields.io](https://shields.io/) — technology badges.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[project-url]: https://github.com/Ccleveland09ner/JobMe
[issues-url]: https://github.com/Ccleveland09ner/JobMe/issues
[next-shield]: https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[next-url]: https://nextjs.org/
[react-shield]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[react-url]: https://react.dev/
[typescript-shield]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[tailwind-shield]: https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white
[tailwind-url]: https://tailwindcss.com/
[three-shield]: https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white
[three-url]: https://threejs.org/
[supabase-shield]: https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white
[supabase-url]: https://supabase.com/
