# JobMe — Adaptive Mock Interview Room

**A voice mock interview where the recruiter actually listens.** Every follow-up targets the weakest part of your last answer, and a live **recruiter's notepad** shows you why.

Built for Devpost *Build With AI: Basics* as a 24-hour solo sprint. One track: **Behavioral · SWE internship**.

> **Status: scaffold.** The structure, types, schema and design tokens are in place. Almost every function body is a `TODO(slice N)` stub that throws. Nothing runs end-to-end yet. See [Where things stand](#where-things-stand).

---

## The idea

Mock interview tools ask a fixed list of questions. A vague answer and a sharp answer get the same next question, so you never practice the follow-up that exposes a gap — which is the moment that actually sinks behavioral rounds.

JobMe scores every answer on five dimensions (Structure, Specificity, Impact, Ownership, Relevance), then adapts:

| Your answer | What happens |
|---|---|
| Vague — "we worked as a team and fixed the bug" | **Clarify**: "You said the team fixed it. What did *you* change?" |
| Strong — STAR, with a number in it | **Deepen**: "What trade-off did you weigh?" |
| Resolved | Next topic, one difficulty level harder if the thread ended strong |

The differentiator is that this is **visible during the interview**, not just in a report afterwards. The notepad shows the five scores, the detected gap, a verbatim quote from what you said, and one line explaining the next move.

## How it works

One Next.js app. The browser does the hearing and speaking; the server scores and decides.

```
Browser (Chrome/Edge)              Next.js on Vercel            Services
---------------------              -----------------            --------
Web Speech API --transcript-->  POST /api/.../turns
                                  |- evaluateAndDraft ------->  Gemini (1 call)
                                  |- embed(answer)   --------->  Gemini embeddings
                                  |     (both in parallel)
                                  |- engine.step()  <- pure TS, no AI
                                  '- UPDATE engine_state ---->  Supabase (RLS)
Notepad + captions  <--notepad, next question--'
<audio> + SVG avatar -->  GET /api/tts  -------------------->  ElevenLabs
                                                               (or browser voice)
```

**The invariant that everything else depends on:** the deterministic state machine owns the flow, and the LLM only scores and phrases. The AI never picks the next move. That is what keeps sessions bounded (4-10 questions), testable with scripted answers, and reproducible on stage.

Two consequences worth knowing before you change anything:

- **Nothing can leave the interview silent or stuck.** TTS fails, browser `speechSynthesis` takes over. Scoring fails, you get a seed Clarify and an honestly-unscored turn. No mic or wrong browser, you get typed mode with the same engine and the same notepad. Report generation fails, the scorecard renders without the rewrite.
- **Audio is never uploaded or stored.** Only transcripts, scores and reports. (Chrome's own speech recognition does send audio to Google — that is disclosed to the user on the setup screen.)

## Quick start

Requires **Node 20+** and **Chrome or Edge** for the voice path.

```bash
npm install
```

Then add the packages the build needs. They are deliberately not pre-pinned, because two of them need a peer-dependency check against React 19:

```bash
npm i zod @google/genai recharts
npm i -D vitest tsx
npx shadcn@latest init   # verify Tailwind v4 + React 19 support at init
```

Set up Supabase (your own project — do not share one):

1. Create a free project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. `cp .env.example .env.local` and fill in the values — see [Environment](#environment).
3. Swap the email template so sign-in sends a **6-digit code** instead of a magic link: **Authentication → Emails → Magic Link**, subject `Your sign-in code`, body from [`supabase/templates/magic_link.html`](./supabase/templates/magic_link.html). The part that matters is that it uses `{{ .Token }}` rather than `{{ .ConfirmationURL }}`.
4. Apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --linked
   ```
   Or paste [the migration](./supabase/migrations/) into the SQL Editor.

```bash
npm run dev    # http://localhost:3000, in Chrome
```

### Environment

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings, API, Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | starter only — **JobMe never uses it**, every route goes through RLS |
| `GEMINI_API_KEY` | server-side only |
| `LLM_MODEL` | verify the current fast-model ID in hour 1, and keep "thinking" off |
| `EMBED_MODEL` | `gemini-embedding-001` |
| `TTS_PROVIDER` | `browser` while developing, `elevenlabs` for demo takes only |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | server-side only |

Only the two `NEXT_PUBLIC_*` values ever reach the browser. A session is roughly 1.5k characters of TTS, so leave `TTS_PROVIDER=browser` unless you are recording.

## Structure

```
docs/                      PRD + Technical Design - read these first
devpost/                   scope.md, prd.md, spec.md (generated by the skill pack)
data/bank-embeddings.json  precomputed bank vectors, committed
public/audio/ack/          static acknowledgment clips
scripts/                   latency-probe, embed-bank, gen-ack-clips

src/lib/engine/            THE KERNEL - pure TypeScript, no AI, unit-tested
  types.ts                 EngineState, Band, Move, Dimension  (written)
  bank.ts                  5 topics x 3 difficulties + seed follow-ups
  classify.ts              classifyBand(), computePrimaryGap()
  policy.ts                step() - every next-move decision lives here
  notepad.ts               deterministic reason lines
  policy.test.ts           scripted weak/strong sessions - the regression harness

src/lib/ai/                llm (Gemini adapter), evaluate, report, embeddings, prompts
src/lib/voice/             stt (Web Speech), tts (+ fallback), audio-graph (lip-flap)
src/lib/                   auth.ts, stats.ts, schemas.ts

src/app/
  page.tsx                 landing
  dashboard/               history + trends
  interview/new/           setup + mic check
  interview/[id]/          the room
  interview/[id]/report/   scorecard
  api/sessions/            create, delete, turns, report
  api/tts/                 voice proxy (key hiding + same-origin for AnalyserNode)

src/components/            dashboard, setup, room, report, ui
supabase/migrations/       4 tables, RLS on all of them
```

`src/lib/ai/llm.ts` is the only file that knows which LLM provider we use. Keep it that way — switching providers should stay a one-file change.

## Where things stand

**Written for real:** the directory tree, `lib/engine/types.ts`, the schema migration (4 tables, RLS, profile trigger), design tokens in `globals.css`, `.env.example`, and page and route shells.

**Stubbed**, each with its contract and spec reference in the file header: everything else. Every stub is tagged `TODO(slice N)` matching the build plan below, so `grep -rn "TODO(slice" src scripts` is your worklist.

### Before you start slice 1

- [ ] **`git init`** — this is not a git repository yet. The hackathon rules want a project started from an empty folder during the submission period, and there is currently no history at all.
- [ ] **Resolve the starter-repo question** (Open Question #1). The rules require an empty-folder start; this tree is the `hackathon-app` starter with JobMe scaffolded on top. Either confirm with the organizers in Discord that using the starter as a template is acceptable, or follow the recovery sequence in *Tech Design, Hackathon Compliance*: empty folder, run the skills, then pull the starter in during slice 1.
- [ ] **Generate `devpost/scope.md`, `prd.md` and `spec.md`** — hard submission requirements, and not present yet. Run the Learn Skill Pack interviews using `docs/` as your answers; both documents map their headings to the skill templates for exactly that.
- [ ] **Delete the starter's todos demo.** [`supabase/migrations/20260911211800_create_todos.sql`](./supabase/migrations/) is still here, and its RLS policies are wide open by design, so it must not survive into the submission. The page that read from it is already gone. It was left in place rather than deleted because there is no git history to recover it from.
- [ ] **Run the latency probe.** `npm run probe` answers the one genuine unknown in the design.

## Build plan

24 hours, thin vertical slices. Each one ends in something you can actually use.

| # | Slice | Hours |
|---|---|---|
| 0 | Planning docs committed | 0-2 |
| 1 | Signed-in user lands on a branded dashboard, **plus the latency probe** | 2-4 |
| 2 | **Typed interview adapts, with notepad** — kernel first | 4-9 |
| 3 | It is a voice interview | 9-13 |
| 4 | The recruiter is on screen | 13-15 |
| 5 | Scorecard | 15-18 |
| 6 | Progress over time | 18-20 |
| 7 | Polish and ship | 20-24 |

Slice 2 is the kernel and comes before any voice work, because a typed interview that adapts correctly is the product. The voice is presentation.

**Cut order if behind:** trend chart becomes a plain averages table; then embedding checks go; then avatar lip-flap becomes a state-only avatar. **Never cut** the engine, the notepad, or the weak-versus-strong demo contrast.

### Verify in hour 1

The design has one genuine unknown: *can a full turn fit in 2.5s on free tiers?* `npm run probe` needs to show eval p50 at or under 1.5s and TTS first byte at or under 0.6s. If not, drop to a lighter model tier or shorten the prompt — now, not in hour 20.

Also confirm the current Gemini fast-model ID and how to disable thinking, the ElevenLabs free-tier credits, and whether `after()` behaves as documented on Next 16 and Vercel. If it does not, just `await` the turn insert, which costs about 80ms.

## Testing

```bash
npm test          # vitest - lib/engine
npm run typecheck
npm run build
```

The engine tests are the regression harness that protects the demo: band edges, each of the four topic-resolution rules, the difficulty bump, the hard cap at 10, plateau detection, plus two scripted sessions (all-weak and all-strong) that must produce different move types. If those pass, the kernel works.

## Working with an AI agent

This repo ships a Claude Code skill at [`.claude/skills/worktree-pr/`](./.claude/skills/worktree-pr/SKILL.md). Run `/worktree-pr` before letting an agent change anything: it branches into a separate worktree, verifies the build, and opens a PR rather than editing your checkout in place.

Rules for agents working here, beyond what is in `AGENTS.md`:

- The engine is **pure and tested**. Never let the LLM choose the move.
- API keys stay server-only.
- No raw JSON, model names or stack traces in the UI, ever.
- **This is not the Next.js you know** (v16, breaking changes). Read `node_modules/next/dist/docs/` before writing routes. Dynamic `params` is a Promise, and `PageProps`, `RouteContext` and `LayoutProps` are generated types.

## Scope

**Not in the MVP:** Google sign-in, voice-activity detection and barge-in, a photoreal avatar, multiple tracks, server-side STT, mobile polish beyond "does not break", and sharing or exporting reports.

**Not what this is:** not a coding-interview judge, and **not a hiring signal** — scores are practice feedback and are never presented as predictions of a hiring outcome. Not a free-form chatbot either; you cannot steer the conversation, the state machine does.

## Docs

- [Product Requirements](./docs/PRD-JobMe-MVP.md) — journey, screens, acceptance criteria, states and boundaries
- [Technical Design](./docs/TechDesign-JobMe-MVP.md) — architecture, data model, API contracts, latency plan, failure modes

Built on [`maxMyers13/hackathon-app`](https://github.com/maxMyers13/hackathon-app). Process from [`challengepost/learn-ai-basics`](https://github.com/challengepost/learn-ai-basics).
