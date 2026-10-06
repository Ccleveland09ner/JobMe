# Migration note — 2026-10-05

Four defects found by running the pipeline against a real resume. Each was
verified from measurement rather than inspection, and each has tests.

## 1. Full mode could not keep its coverage promise

**Two defects, not one.**

The cap formula assumed two turns per resume item. Measured
(`npm run measure` → `scripts/measure-pacing.ts`), the real cost was **4.62
turns per item**, so six items needed 36 turns against a cap of 16.

Worse, coverage **stopped at the bank topic count** no matter how large the
cap. `step()` wrapped unconditionally when it ran out of bank topics, so a
resume with more items than topics could never be fully covered — running out
of *variety* ended an interview that still owed the candidate coverage.

Changes:

| Before | After |
|---|---|
| `cap = items * 2 + 4`, max 24 | `cap = items * 2 + 9 + 1`, max 30 |
| Bank and resume threads alternate 1:1 | `FULL_BANK_THREADS = 3`, then pure coverage |
| 2 follow-ups on every thread | 1 on full-mode resume threads, 2 on bank |
| Wrapped when bank topics ran out | Falls back to the next uncovered item |
| Over-long resume silently under-covered | Trimmed to `maxCoverableItems()` at `initState` |

Turns per item fell from **4.62 to 3.38**, and every item count from 1 to 12
now reaches full coverage inside its cap.

A resume with more items than 30 turns can reach is now **trimmed at session
creation**, by relevance. `coverageTotal` therefore reports what will actually
be covered instead of a number the session cannot honour.

**Behaviour change worth knowing:** a full-mode resume thread now gets one
follow-up, not two. Full mode buys breadth; quick mode still digs the full two.

## 2. Relevance ranking was effectively random

Scores were the maximum cosine across an item's chunks. A resume routinely has
more items than chunks, so items sharing a chunk scored **identically** —
observed on a real resume as `0.618, 0.618, 0.597, 0.597, 0.597, 0.597`.

Ranking is now a weighted blend, all components 0..1:

```
0.55 semantic  (0.6 * the item's own vector + 0.4 * its best chunk)
0.25 lexical   (share of the posting's terms the item evidences)
0.10 kind      (role 1.0, project 0.75)
0.10 recency   (resume order, WITHIN each kind)
```

Each item is embedded as its own document, which is what makes the scores
distinct. Ties break deterministically — kind, then resume order, then id — and
scores are rounded, so the same resume always produces the same order.

Recency is computed per kind because a resume lists roles and projects as two
separate reverse-chronological sequences; a single global index made the first
project outrank the second role.

With no job description, ranking falls back to kind and recency — still
deterministic, where it previously returned the list untouched.

## 3. PDF extraction produced broken headings

Observed: `EDUC ATIO N`, `T EC HNIC AL SKILLS`.

**This is not an extractor artifact and no extractor setting fixes it.**
`extractTextItems` reports `"EDUC ATIO N"` as a *single text item* with the
spaces already inside — the PDF genuinely contains them, because the author
applied letter-spacing in their word processor.

Added `repairLetterSpacing()`, deliberately conservative: a line is rewritten
only when it looks letter-spaced (several tokens, mostly short, no lowercase or
digits) **and** its despaced form is entirely known heading vocabulary.
Anything else is returned untouched, because repairing nothing beats inventing
a heading.

Separately, chunks were split only at the 1800-token hard ceiling, so a compact
one-page resume put four projects into one 1822-character chunk. Added
`TARGET_CHUNK_TOKENS = 240`, split on line boundaries. **Not** fixed token
windows: those cut mid-sentence and separate a bullet from the role it belongs
to.

On the real resume: headings now read `EDUCATION` / `TECHNICAL SKILLS`, and
chunks went from **4 to 8**.

## 4. service_role had no table grants

`20260927100000` granted the application tables to `authenticated` only, on the
reasoning that JobMe never uses the service key. True of the application — but
it left admin tooling unable to touch its own tables (`permission denied for
table resumes`). Bypassing RLS is not the same as holding a table GRANT, and
Postgres checks the grant first.

`20261005120000_service_role_grants.sql` grants the tables and both RPCs to
`service_role`, plus default privileges so the next migration does not
reintroduce the gap. The safety property is unchanged: the key is server-side
only and no application code reads it.

Added `npm run cleanup:test`, which deletes rows **explicitly in FK order**
rather than deleting the auth user and trusting `on delete cascade`. A cascade
misses rows orphaned by an earlier partial failure, and it fails silently — the
missing grant above looked like a clean run for exactly that reason.

## Applying this

```
npx supabase db push --linked
```

All migrations are applied, verified live on 2026-10-05.

`npm run check:db` now detects that state. It previously reported
`auth: reachable` against an unreachable project, because `getSession()` reads
the local session without touching the network.


## Follow-up found by live verification — 2026-10-05

`EVAL_TIMEOUT_MS` was 2200ms, sized against a 964ms bare-prompt measurement.
The live prompt carries distilled resume facts, a role summary and the question
plan, and the real distribution runs wider: measured over a 22-turn interview,
successful evaluations took **1121-3367ms**.

The old limit clipped that tail. Four of 22 turns returned
`degraded: timeout` with `evalMs` of 2202-2218 — cut off at the abort rather
than failed. An 18% unscored rate on answers the model was about to score.

Raised to **4000ms**, which halved it to 2 of 22. The two that remain sat at
~4010ms with a clean gap from the scored maximum of 3367ms, so they were
genuinely slow rather than marginally over; that residual is what the degraded
path exists for.

The lever if it needs to go lower is prompt size, not a longer timeout: decode
dominates this call, and the turn prompt grew when resume personalisation
landed.
