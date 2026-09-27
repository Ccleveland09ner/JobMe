# Backend Implementation Brief — JobMe

**Audience:** a coding assistant implementing the server-side of this application.
**Status of the repo:** verified scaffold. Every module named below exists with typed signatures and a `TODO(slice N)` body that throws. `next build`, `tsc --noEmit` and eslint are green. Nothing runs end-to-end.

Read `docs/PRD-JobMe-MVP.md` and `docs/TechDesign-JobMe-MVP.md` first for product and architecture context. **Then read the corrections in §2 of this brief — those two documents are out of date in six specific ways, and following them literally will produce broken code.**

---

## 1. Your scope

Build the remaining backend: the adaptive engine, the session/turn/report routes, auth, validation, stats, and report generation.

### In scope

| Area | Files |
|---|---|
| Engine (pure TS, no AI, unit-tested) | `src/lib/engine/{classify,policy,notepad}.ts` + `policy.test.ts` — `types.ts` and `bank.ts` are already done |
| Validation | `src/lib/schemas.ts` (Zod is installed; the schemas are still stubs) |
| Stats | `src/lib/stats.ts` — note `wpm` uses `capture_ms`, see §2.8 |
| Session routes | `src/app/api/sessions/route.ts`, `src/app/api/sessions/[id]/route.ts` |
| Turn route (the hot path) | `src/app/api/sessions/[id]/turns/route.ts` |
| Report | `src/app/api/sessions/[id]/report/route.ts`, `src/lib/ai/report.ts` |
| Migration additions | one new file under `supabase/migrations/` |

### Explicitly NOT in scope — another workstream owns these concurrently

Do not create, edit, or refactor:

- `src/lib/voice/*` (STT, TTS, audio graph)
- `src/app/api/tts/route.ts`
- `src/app/api/resume/route.ts`, `src/lib/resume/*` and `src/lib/jd/*` (built; resume ingestion, redaction, chunking, embeddings, JD distillation and coverage ranking)
- `src/lib/ai/{llm,evaluate,prompts,embeddings,questions,resume-questions}.ts` (built)
- `src/lib/engine/{types,bank}.ts` (built — read them, do not rewrite)
- `src/lib/auth.ts` (built — `requireUser()` and `getUserOrNull()` both work; call them, see §2.3)
- `scripts/*.ts`

**The turn route consumes `evaluateAndDraft()` from `src/lib/ai/evaluate.ts` and `embed()`/`cosine()` from `src/lib/ai/embeddings.ts`. Program against their existing exported signatures. Do not implement them.** If you need a behaviour they don't expose, write the call site as if it did and leave a `TODO(integration)` comment naming what you need — do not reach into those files.

Also out of scope: all UI. `src/components/**` and every `page.tsx` belong to a later phase.

---

## 2. Corrections to the repo documentation — read before writing code

These were verified against live documentation. The tech design predates them.

### 2.1 Model and rate limits (already fixed — context only)

`gemini-2.5-flash` was the default and is restricted to projects with prior usage. The project now runs `gemini-3.5-flash-lite` with **no** thinking config: measured, that is both zero-thought and the fastest of the three modes, while `thinkingBudget: 0` is rejected outright on that model. See the measurement table in `src/lib/ai/llm.ts`.

**The free tier is 15 requests per minute, per model** (measured). Fine for one call per turn across an ~8 minute interview; not fine for back-to-back scripted runs. This is why the degraded-turn path in §6.5 is mandatory rather than optional.

### 2.2 Toolchain (already fixed — context only)

`zod` was a phantom `node_modules`-only package and is now a real dependency. `vitest`, `tsx`, `@google/genai` and `unpdf` are installed, `vitest.config.mts` exists, and `@types/node` was aligned to `^24` to match the runtime. `npm test` runs; 108 tests pass.

### 2.3 Routes authenticate themselves (already fixed — context only)

`src/proxy.ts` no longer matches `/api/*`, because `updateSession()` → `getUser()` was adding a 100–270ms network hop to every route inside a 1.5s turn budget. **Your routes must therefore call `getUserOrNull()` from `src/lib/auth.ts` themselves** — it is implemented and returns `null` so you can answer 401 JSON. There is no session-refresh middleware behind you any more.

### 2.4 The turn insert must NOT go in `after()`

`docs/TechDesign-JobMe-MVP.md` says the `turns` row is inserted via `after()` for latency. **Do not do this.** If that insert fails after the response is sent, the candidate heard a question that was never persisted, and the next request's `clientTurnSeq` check mismatches against a stale `turnSeq` — silently breaking the idempotency guarantee that the whole submit path depends on.

Both the `turns` insert and the `engine_state` update are **synchronous, before the response** (~80–200ms combined). `after()` is for telemetry and TTS prewarm only.

`after()` itself is stable, imported from `next/server`, works in Route Handlers, and runs **even if the response errored** — so anything you put there must be safe to run after a failure.

### 2.5 `evidence` and `primary_gap` are no longer model outputs

The tech design's `Evaluation` schema has the model return both. Decision taken: **both are computed in code instead.**

- `primary_gap` — `computePrimaryGap()` already overrode the model's value, so paying decode tokens for it was pure waste. It is now only computed locally.
- `evidence` — computed locally as the highest keyword/number-density sentence from the answer, capped at 20 words. Models paraphrase rather than quote, so a verbatim substring check was required anyway; computing it guarantees the highlight match in the scorecard and removes a hallucination class.

Your `notepad.ts`, stats, and report code should assume `evidence` is a locally-derived string that is **guaranteed** to be an exact substring of the answer.

### 2.6 The rubric is now eight dimensions, but banding uses five

`structure` was split into the four STAR components, so `Dimension` is now `situation | task | action | result | specificity | impact | ownership | relevance`. `src/lib/engine/types.ts` is already updated — read it rather than the tech design.

**Do not band over all eight.** The `great` rule is `avg >= 3.5 && min >= 3`, and eight dimensions give three extra chances to trip the `min` clause — Task especially, since speakers routinely fold it into Situation. Banding over all eight makes `great` nearly unreachable and kills the weak-vs-strong demo contrast.

`types.ts` exports `starRollup(scores)` and `bandingValues(scores)` for this. `classifyBand` must compute over `bandingValues()` — the STAR mean plus the other four — while `computePrimaryGap` still considers all eight, so the notepad can say "no Result" rather than "structure: 2". This is verified live: a perfect answer scores `[S4 T4 A4 R4]` and still reaches `great`.

### 2.7 Two interview modes, and a coverage guarantee

`EngineState` gained `mode`, `questionCap`, `resumeItems`, `resumeItemIndex` and `lastQuestionSource`.

- **Quick** (`QUICK_QUESTION_CAP = 10`) is the practice and demo format: bank-led and bounded.
- **Full** derives its cap from the resume via `fullModeCap(itemCount)` — roughly two questions per item plus four bank questions, clamped to 8–24 — and **must not wrap while `uncoveredItems(state)` is non-empty**, unless the cap is hit first.

`resumeItems` arrives pre-ranked by relevance to the pasted job description, most relevant first. Preserve that order: a session that runs out of budget must still have covered the experience closest to the job being applied for. Mark an item `covered` once the candidate has answered at least one question about it.

`Question` gained `source: 'bank' | 'resume'` and an optional `resumeItemId`. A realistic screen alternates, so the policy should interleave bank-opened threads (which become personal in the follow-ups) with threads opened directly on a resume item — `lastQuestionSource` is the bookkeeping for that. `src/lib/ai/resume-questions.ts` generates the resume-led wording and has a deterministic fallback, so a rate limit costs polish, never coverage.

### 2.8 There are two answer durations, not one

`turns.wpm` implies one. There are two, and the distinction is load-bearing:

- **`holdMs`** — how long the talk button was held. Includes thinking pauses. Use for answer length and pacing feedback.
- **`captureMs`** — summed time the recognizer was actually capturing, across auto-restarts.

**`wpm` must be computed over `captureMs`.** Using `holdMs` under-reports speaking rate by 20–40% on a thoughtful answer. Your migration adds a `capture_ms` column (see §4); the turn route receives both from the client.

---

## 3. The invariant — the single most important constraint

**A deterministic state machine owns all flow control. The LLM only scores answers and drafts candidate wordings. The engine decides which draft is used.**

This is what makes the demo reproducible: the same scripted weak answer must *always* produce a Clarify move, and the same strong answer a Deepen. Judges will see this side by side.

Concretely:

- `RawEvaluation` (in `src/lib/ai/evaluate.ts`) **must never gain a field named `move`, `action`, or `next_question`.** If you find yourself wanting one, the design is being violated. This single rule is reviewable in five seconds — treat it as a hard gate.
- Topic openings always come from `src/lib/engine/bank.ts` via a pure function over `EngineState`. Never generated.
- `deepen` / `clarify` is the only branch where model-produced text reaches the candidate, and even then the engine chose the branch and validated the text.

### Three places flow control is currently hiding inside scoring — fix these

1. **`off_topic` is a single model boolean** that drives `weak` → `clarify`. Gate it: require `off_topic && relevance <= 2`, or derive it from the answer-vs-question cosine you already compute. Make it engine-derivable rather than model-dictated.

   **This is confirmed, not theoretical.** Running the evaluator against a scripted strong answer (`npm run probe:eval`) produced `avg 3.60, min 2, ownership 4` — and the band came out **weak**, because the answer described a solo performance fix in response to a *teamwork* question and the model set `off_topic: true`. The model's judgement was correct; the failure is that one boolean outranked five scores averaging 3.6. Without the gate, a strong candidate who slightly mis-frames an answer gets treated identically to someone who said nothing. Reproduce it by reverting the STRONG fixture in `scripts/probe-evaluator.ts` to a non-teamwork story.

2. **The anchor downgrade in `classify.ts`** turns `great` into `mediocre` when `simWeak - simStrong > 0.05`. That is an uncalibrated threshold over embeddings that shift with any change to the exemplar bank, the model, or `outputDimensionality`. It is the most likely cause of "the scripted weak answer produced Deepen" on stage. **Put it behind a flag that defaults to off**, and leave a comment saying it must be calibrated against a frozen `data/bank-embeddings.json` before being enabled.

3. **Add a deterministic pre-classifier that runs before the model is consulted.** Under 25 words, or no concrete noun and no number → force `weak`. Relevance is blended from a float and fed into `avg >= 3.5 && min >= 3`, so a ±1 swing otherwise flips the band and therefore the move. This rule is the demo insurance.

---

## 4. Data model additions

The main schema is already applied — see `supabase/migrations/20260926120000_jobme_schema.sql` for `profiles`, `interview_sessions`, `turns`, `reports`, with RLS on all four.

Write **one new migration** adding:

- `turns.capture_ms int` — see §2.6. Keep the existing duration column for hold time; name the new one explicitly.
- `interview_sessions.resume_id uuid` — a nullable FK to the `resumes` table the other workstream is creating. **Make it nullable and do not add the FK constraint yet**; that table may not exist when your migration runs. Leave a `TODO(integration)` comment to add the constraint once it does.

Match the existing file's conventions exactly: RLS enabled, policies `to authenticated` using `(select auth.uid()) = user_id`, no public policies, no use of the service-role key anywhere.

`turns.scores` is nullable, and **null means "the evaluator failed twice; this turn is unscored."** Unscored turns are kept, displayed honestly, and **excluded from every average** — in the report, in `overall_scores`, and in the dashboard trend. Get this right in `report.ts` or the scorecard silently lies.

---

## 5. The engine

`src/lib/engine/types.ts` is already written in full — `EngineState`, `Band`, `Move`, `Dimension`, `Scores`, `GAP_PRIORITY`, `NotepadEntry`. **Do not change it.** Everything else types against it.

### 5.1 `bank.ts` — already done, do not rewrite

All **11** topics are authored (the 10 standard behavioural questions plus `technical_challenge`), each with L1/L2/L3 openings, deepen seeds, gap-keyed clarify seeds and weak/strong exemplars. `BANK` is a complete `Record<TopicId, TopicEntry>`.

Exported helpers you should use rather than reimplement: `questionFor(topic, difficulty)`, `clarifySeeds(topic, gap)` (falls back to generic seeds so every one of the eight gaps has coverage), `deepenSeeds(topic)`, and `pickTopics(count, exclude)`.

Openings are **fixed text and never generated** — that is what makes the demo reproducible and what guarantees there is always something to ask when the model is rate limited.

### 5.2 `classify.ts`

```
classifyBand(scores, offTopic, anchor?)
  let values = bandingValues(scores)   // STAR roll-up + the other four
  let avg = mean(values), min = min(values)

  1. offTopic && relevance <= 2                 -> weak   (see §3.1)
  2. avg < 2.0                                  -> weak
  3. avg >= 3.5 && min >= 3                     -> great
  4. otherwise                                  -> mediocre
  5. anchor downgrade (FLAG OFF by default):
     great && (simWeak - simStrong) > 0.05      -> mediocre
```

`computePrimaryGap(scores)` considers **all eight** dimensions, ties broken by `GAP_PRIORITY` (exported from `types.ts`: ownership > impact > result > action > specificity > task > situation > relevance).

**Known instability at the weak/mediocre boundary.** A genuinely borderline answer scored 2.00 on one run and 1.55 on the next — the same answer, different band. Weak and mediocre both produce a Clarify, so the *move* is unaffected, but they differ in tone and in the resolution rule ("a weak thread that stayed weak after one clarify resolves the topic"). The deterministic pre-classifier in `src/lib/ai/questions.ts` catches the thin cases before the model sees them; if flicker persists on real answers, add hysteresis here rather than tightening the prompt.

### 5.3 `policy.ts` — `step(state, evaluation) -> { state, move, question }`

**Resolve the current topic if ANY of:**
- `followUpsUsed === 2`
- this was a follow-up **and** no dimension rose by ≥1 versus the previous answer in the thread (plateau)
- `lastMove === 'deepen'` **and** `band === 'great'`
- `lastMove === 'clarify'` after a weak **and** `band === 'weak'`

**Not resolved:**
- `great` → `deepen` (use `drafts.deepen`, else `seeds.deepen`)
- `mediocre` or `weak` → `clarify` aimed at `primaryGap` (use `drafts.clarify`, else `seeds.clarify[primaryGap]`)

**Resolved:**
- thread ended `great` → `difficulty = min(3, difficulty + 1)`
- if the thread was resume-led, mark its `ResumeItem.covered = true`
- choose the next thread, alternating `source` so the interview mixes bank-opened and resume-opened threads (see §2.7)
- **full mode:** never `wrap` while `uncoveredItems(state)` is non-empty — pull the next uncovered item instead, in ranked order
- **quick mode:** advance through `topics`, opportunistically covering the highest-ranked uncovered items
- no topics left, nothing uncovered, **or** `questionCount >= state.questionCap` → `wrap`

**The cap is checked BEFORE any follow-up is issued**, and it is `state.questionCap`, not a literal 10 — quick mode sets it to `QUICK_QUESTION_CAP`, full mode to `fullModeCap(itemCount)`.

`step()` must be pure: same inputs, same outputs, no I/O, no `Date.now()`, no `Math.random()`. Randomness belongs in `pickTopics()` at session creation, where it is captured into `EngineState.topics` and never re-rolled.

### 5.4 `notepad.ts`

`reasonLine(move, gap, band)` builds the reason text deterministically, e.g. `impact` + `clarify` → `"No measurable result → asking for impact"`. The model's `observation` supplies the *what I noticed* line; this supplies the *why I'm asking this next* line. It must be built here so it can never contradict the move actually taken.

### 5.5 `policy.test.ts` — the regression harness

This is what makes the invariant true rather than hoped-for. Required cases:

- Band edges: `avg` exactly 3.5 with `min` 3; `avg` exactly 2.0; `offTopic` true
- Each of the four resolution rules, in isolation
- Difficulty bump, and that it caps at 3
- Hard cap at 10, asserted to fire *before* a follow-up is issued
- Plateau detection
- Anchor downgrade both with the flag on and off
- **Scripted all-weak session** → Clarify → resolve → next topic, 4–8 questions total
- **Scripted all-strong session** → Deepen → resolve → harder, fewer questions
- **Full session driven by a stubbed evaluator, zero network** — assert the exact move sequence, `questionCount` capping at 10, `followUpsUsed` capping at 2, and difficulty bumping only on a thread that ended `great`

---

## 6. Routes

Next.js 16 specifics, all verified against `node_modules/next/dist/docs/` (which `AGENTS.md` requires you to read):

- Dynamic `params` is a **Promise**: `const { id } = await ctx.params`. Synchronous access was fully removed in 16.
- `RouteContext<'/api/sessions/[id]/turns'>` and `PageProps<...>` are **generated globals** — not imports. They are produced by `next dev` / `next build` / `next typegen` into gitignored `.next/types`, so a fresh clone must run `next typegen` before `tsc --noEmit`. The existing route stubs already use this pattern; follow it.
- Route Handlers are **not cached by default**.
- **Do not add a `runtime` export.** Edge is deprecated in 16; Node is the default and is what `after()` requires.
- Validate every body with Zod. Input caps are already declared in `src/lib/schemas.ts` as `LIMITS`: transcript 5000, roleText 2000, ttsText 600, displayName 40.
- Routes return `401` JSON; they never redirect. `src/lib/auth.ts` exports `requireUser()` (redirects, for pages) and `getUserOrNull()` (for routes) — implement both.
- A row belonging to another user is invisible under RLS, so "not found" and "not yours" are the same **404**. Do not write an ownership check that leaks the difference.

### 6.1 `POST /api/sessions`

Request `{ displayName: string(1..40), roleText?: string(..2000) }` → `{ sessionId, introLine, question: { text, type: 'opening', topic, difficulty }, progress: { topicIndex, topicsTotal: 4, questionCount } }`. Errors 401, 422.

Steps: auth → update `profiles` (`display_name`, `target_role`) → `pickTopics()` → `initState()` → insert `interview_sessions` → return.

`role_text` and the resume are **different things** and both are kept: the JD is the target job, the resume is candidate history. Accept `resumeId` as an optional field now so the contract doesn't change at integration.

### 6.2 `DELETE /api/sessions/[id]`

→ `204`. Errors 401, 404. `turns` and `reports` cascade on the FK, so one delete suffices.

### 6.3 `POST /api/sessions/[id]/turns` — the hot path

Request `{ transcript, durationMs, captureMs, clientTurnSeq }` → either `{ kind: 'nudge', line }` or `{ kind: 'turn', notepad, next, done, wrapLine?, progress }`. Errors 401, 404, 409, 422.

**Exact order — the latency budget and the correctness guarantees both depend on it:**

1. Auth in-route (the proxy no longer covers `/api/*` after §2.3).
2. Zod-validate the body.
3. Load the session and `engine_state`. Missing → 404.
4. `clientTurnSeq !== state.turnSeq + 1` → **409 with the current state in the body** so the client can resync. This plus `unique(session_id, seq)` is what makes a double-submit harmless — and with a push-to-talk button, double-submits happen constantly.
5. `wordCount(transcript) < MIN_ANSWER_WORDS` (5, already exported from `stats.ts`) → return a nudge. **No scoring, no `questionCount` increment, no `turnSeq` increment.**
6. Run the deterministic pre-classifier (§3.3).
7. `Promise.all([evaluateAndDraft(...), embed(answer)])` — **in parallel.** Serializing these blows the budget outright. Wrap with `AbortSignal.timeout(2200)`.
8. On `EvalError`, timeout, or 429 → **the degraded path** (§6.5). Never fail the turn.
9. Blend relevance, run the anchor check (flag-gated), then `classifyBand()`.
10. `computePrimaryGap()` — overrides whatever the model said.
11. Compute `evidence` locally (§2.5).
12. `step(state, evaluation)` → move, next question.
13. Validate the chosen draft: non-empty, ends with `?`, ≤25 words, no placeholder leakage, not already in `askedQuestions`. Fall back to the bank seed on any failure.
14. **Synchronously:** update `engine_state` + `question_count`, and insert the `turns` row. Both before the response (§2.4).
15. Return.
16. `after()`: telemetry and TTS prewarm only.

### 6.4 `POST /api/sessions/[id]/report`

→ `{ summary, weakestTurnId, rewrite | null, stats, overallScores }`. Errors 401, 404.

**Idempotent: if a `reports` row exists, return it and make no LLM call.** `session_id` is the PK, so this is enforced at the database level too.

Steps: pick the weakest **scored** turn (lowest average; ties → earliest) → one LLM call for `{ summary (≤80 words), rewrite (STAR, ≤170 words) }` → compute `overall_scores`, overall WPM and filler count **in code** → insert the report → update the session to `completed` with `ended_at` and `overall_scores`.

The rewrite uses **only the candidate's own stated facts**, with `[metric]` placeholders where a fact is missing. It must invent nothing — a rewrite that fabricates a number teaches someone to lie in a real interview. Put that constraint in the prompt and assert it in a test with a fixture answer containing no numbers.

If the LLM fails: save the report with `rewrite = null`. Everything else is computed in code and always renders.

This is also the **End early** target, so it must work with as few as **1** answered turn. Check that the Vercel function `maxDuration` covers it.

### 6.5 The degraded turn — required, not optional

Free-tier Gemini rate limits are **no longer published** and must be read per-project from AI Studio; unofficial reports suggest the newest Flash tier may allow as few as ~20 requests/day. Assume the evaluator will be unavailable at some point, including possibly during the demo.

On timeout, 429, or a second Zod failure: skip the model entirely. Score heuristically (word count, digit presence, STAR-keyword hits), pick the move with `step()` as normal, and use `bank.seeds.clarify[primaryGap]`. Persist with `scores: null` and a degraded marker. The notepad shows `SCORING_FAILED_LINE` (already exported from `notepad.ts`) — never a stack trace, a model name, or raw JSON.

This path is simultaneously the latency fallback, the quota fallback, and a live demonstration that the engine can run an entire interview with the model down. Test it explicitly by forcing the failure.

---

## 7. `stats.ts`

`wpm(text, captureMs)` — words / (captureMs / 60000), rounded. **Not `holdMs`** (§2.6).

`fillerCount(text)` uses the `FILLER_RE` already exported from the file. Label it **approximate** wherever it surfaces: Chrome's speech recognition drops most "um"/"uh" before the server ever sees the transcript, and claiming precision we don't have would be the wrong kind of confident.

---

## 8. Definition of done

- [ ] `zod` promoted to a real dependency; `vitest` and `tsx` installed; vitest configured
- [ ] `proxy.ts` matcher excludes `/api/*`; every route authenticates in-route
- [ ] `npm test` green, including both scripted sessions and the stubbed-evaluator full-session test
- [ ] `npm run typecheck && npm run build` green
- [ ] Migration applies cleanly; RLS verified **against the hosted database** with two users — user A's cookie against user B's session returns 404 and zero rows. Policy typos are the classic Supabase failure and local testing hides them.
- [ ] Banding computes over `bandingValues()`, not all eight dimensions; a `[S4 T4 A4 R4]` answer still reaches `great`
- [ ] Full mode does not wrap while any resume item is uncovered
- [ ] Quick mode still caps at 10 and stays reproducible for the demo
- [ ] Resume items are asked in ranked order (most relevant to the pasted job description first)
- [ ] Question `source` alternates rather than drifting all-bank or all-resume
- [ ] Double-submit test: the same `clientTurnSeq` twice produces one `turns` row and a 409
- [ ] Nudge test: a 3-word answer does not increment `questionCount` or `turnSeq`
- [ ] Degraded-turn test: with the evaluator forced to fail, a full session still completes and reaches a scorecard
- [ ] Report is idempotent (second call makes no LLM call) and works with exactly 1 answered turn
- [ ] Unscored turns excluded from every average
- [ ] No raw JSON, model name, or stack trace reachable in any response body
- [ ] `RawEvaluation` has no `move` / `action` / `next_question` field

## 9. Conventions

- Match the surrounding code's comment density and style. Existing stubs carry a header comment naming the spec section they implement — keep that pattern and update it as you implement.
- `AGENTS.md` requires reading the relevant guide in `node_modules/next/dist/docs/` before writing route code. This Next.js version has breaking changes; do not rely on general Next.js knowledge.
- Server-only secrets stay server-only. Only `NEXT_PUBLIC_*` reaches the browser. JobMe does not use the service-role key anywhere — every route goes through RLS with the cookie-based server client.
- The repo ships a `/worktree-pr` skill at `.claude/skills/worktree-pr/`. Use it rather than editing the main checkout directly.
- If you deviate from this brief, say so explicitly in the PR description with the reason. Silent deviation on the invariant in §3 is the one thing that cannot be reviewed after the fact.
