# Scoring rubric and question selection

How JobMe scores answers, chooses questions and writes feedback, as of 2026-10. This replaces the 8-dimension STAR rubric described in the PRD and TechDesign. Code references are relative to `src/lib`.

## Why it changed

An audit traced answers that seemed reasonable through the old pipeline and found code causes for the low scores, not weak answers:

| Defect | Effect |
|---|---|
| Situation, Task, Action and Result were 4 of the 8 dimensions, and the prompt said "a strong answer needs all four" | Content told in any other order lost marks. Task scored 1–2 whenever it was folded into the context. |
| Result and Impact had near-identical scoring guides, and both required before-and-after numbers for a 4 | A clear qualitative outcome was capped at 3 on two dimensions. |
| `preClassify` forced Weak on any answer with no digit and no capital letter mid-sentence, and on anything under 25 words | Chrome's speech recognition returns lowercase text with no punctuation, so most voice answers were banded Weak before the model saw them. Focused follow-up replies were banded Weak too. |
| Every turn was averaged equally | An opening that missed the outcome kept its low score even after a follow-up supplied the outcome. |
| `difficulty` and seniority never reached the prompt | Interns were judged against "stakes, scale, verifiable detail". |
| Banding weighted STAR at 20% while the dashboard average weighted it at 50% | The two headline numbers disagreed. |

Measured on the calibration fixtures (`scripts/calibration-fixtures.ts`):
- A qualitative answer the model scored 4/4 was banded Weak.
- A transcript with recognition errors scored the same as its clean twin and was still banded Weak.
- A correct technical explanation scored 2.1/4 because it was not a story.

## The rubric

Every question has a **kind**, taken from its topic (`engine/types.ts` `TOPIC_KINDS`). A resume-led question is always `resume`. Each kind is scored on a weighted subset of seven dimensions:

| Dimension | Behavioural / resume | Technical | Problem solving | Motivational |
|---|---|---|---|---|
| Relevance: answers the question asked | .15 | .15 | .10 | .25 |
| Specificity: concrete, real evidence | .20 | .15 | .20 | .35 |
| Ownership: own contribution and decisions | .20 | | | |
| Reasoning: why; approach and trade-offs | .25 | .25 | .35 | .25 |
| Outcome: result, consequence, or a lesson | .15 | | | |
| Accuracy: correct | | .35 | .20 | |
| Communication: easy to follow | .05 | .10 | .15 | .15 |

**Why these weights:**
- The dimensions that show the competency carry the weight: contribution, reasoning, evidence and correctness.
- Communication stays light because a speech transcript is a noisy signal of delivery and must never stand in for accent or grammar. It never blocks the Strong band, and no follow-up ever targets it.
- STAR is not a dimension. It is one good way to tell a story, and the rubric scores what the story shows, however the candidate tells it.

**Levels** (each dimension's scoring guide in `ai/prompts.ts` refines these):

| Score | Level | Meaning |
|---|---|---|
| 1 | Missing | No evidence for this dimension. |
| 2 | Partial | Present, but vague, generic, or with a notable gap. |
| 3 | Solid | What a good candidate *at this level* gives. |
| 4 | Strong | Unusually clear, deep or insightful for this level. |

**Fairness rules** (in the evaluator prompt for every kind):
- Score substance, not format. Never require STAR or its order.
- Calibrate to the candidate's level. For interns, class, club, volunteer and personal projects count fully.
- Numbers are never required. A clear qualitative result or a specific lesson earns a 3.
- Saying "we" is fine as long as the candidate's own part is clear.
- Longer is not better. A concise answer can score 4.
- The answer is a speech transcript: read misheard words charitably. Never penalise grammar, accent, fillers or non-native phrasing.
- Incomplete is not incorrect. Missing evidence scores as missing, and only wrong claims lower accuracy.
- Use only what the candidate said, and justify every score from the answer.

**Bands** keep their thresholds: Weak is below 2.0 (or off-topic); Strong is 3.5 or above with no scored dimension below 3 (communication excepted); everything between is Developing. They are now applied to the kind's weighted score. Candidates see "Needs work", "Developing" and "Strong". `preClassify` only forces Weak on an *opening* under 12 words. The demo's 9-word weak answer is still caught, and follow-ups are exempt.

The evaluator also returns:
- `status`: complete, incomplete, incorrect, off_topic or no_experience.
- `clarify_gap`: the dimension its clarify draft targets. The engine uses it when the scores agree (`resolveGap`), so the notepad's reason line describes the question actually asked.

## Follow-ups add to the original question

A follow-up is not a new question.
- **What the evaluator sees:** the original question, plus the whole answer so far. That is the first answer, then each "Interviewer follow-up / Candidate added" exchange.
- **How it scores:** it scores the combined answer against the original question. A follow-up can fill a gap, but never removes credit already earned.
- **What counts:**
  - Each original question's score is its **latest cumulative evaluation** (`stats.ts` `groupIntoQuestions`).
  - Earlier, less complete evaluations stay on the notepad as the answer's progress, but are never averaged.
  - An opening that missed the outcome, followed by a follow-up that supplied it, scores as the complete answer.
- **Rollups:**
  - The overall score is the mean of the question scores.
  - Each dimension's average covers only the questions it applies to.
  - Competency results group questions by topic.

**When the interviewer moves on:**
- The candidate says they have no such experience, so pressing would only invite an invented story.
- The answer plateaus.
- A deepen follow-up lands Strong.
- Two weak answers in a row.
- The follow-up limit is reached: two per thread, one for motivational threads and for resume threads in full mode.

## Question selection

`engine/roles.ts` classifies the job title into a family (software, product, data or general) and infers the seniority. Every interview then:
1. **Opens with motivation:** "Tell me a bit about yourself and what draws you to this role."
2. **Asks the family's own question second:**
   - software: `technical_knowledge`;
   - product: `product_sense`;
   - data: `data_reasoning`;
   - general: none, so the interview stays behavioural.

   It comes second so that quick mode's question cap can't cut it.
3. **Fills the rest** with behavioural competencies that family is screened on, in random order.

These defaults need no model. A rate-limited session for a PM intern still gets product questions.

The question plan (`ai/question-plan.ts`, one call at session start) may re-choose and re-order topics for the specific job description. Repairs keep motivation first and a role question, and fill from the defaults. The plan also:
- words **every** chosen topic for the job;
- gives each topic a purpose, which the scorecard shows;
- orders resume items by relevance to *this* job.

**Rules for generated questions:**
- Each must be answerable from school, clubs, volunteering, work or personal projects.
- None may presume an experience the candidate may not have.
- Technical questions only cover skills the posting names.
- Nothing about the company may be stated beyond what the posting says.

**The job context** is title, company, family and seniority. It is stored in `question_plan.job` even when the model fails, so every turn still knows the role. A company read from a Lever or Ashby link is marked as inferred. A job description under 80 characters is ignored, and so is personalisation from it. When tailoring fails but job details were given, the recruiter says so in the spoken intro.

## Feedback

The report call sees every question with its whole answer and returns:
- a summary;
- up to three strengths, each with a quote checked in code to be the candidate's own words (`verifyQuote`);
- up to three improvements, each with a concrete recommendation, tied to a question;
- a stronger version of the weakest answer, built only from the candidate's facts, with `[placeholders]` for anything missing and any invented number replaced. It is shaped to the question type, and STAR is used only for stories.

Strengths and improvements are stored in `reports.stats.feedback`, with no migration. Without the model, the fallback summary and improvements are built from the scores, and none of them asks for numbers.

## Calibration

| Command | What it does |
|---|---|
| `npm run calibrate` | Runs the fixtures live. Checks ranges, ordering, the transcript-error pair (within 0.4), the follow-up case and stability across runs. |
| `npm run compare:plans` | Prints the question set for a SWE intern job description, a PM intern job description, a title only, nothing at all, and the link failures. Add `--offline` to see the role defaults alone. |

A change that passed calibration by raising every score would fail its evasive, partial and incorrect cases.

**Known residual (2026-10-20):**
- **The garbled transcript still scores below its clean twin.** The fixture is lowercase, unpunctuated, with misheard terms and non-native grammar. It scores 0.5–0.7 below its clean twin when the role context includes a company, though only about 0.05 below without it. The check flags this, and it stays flagged on purpose. Before the change, the same transcript was banded Weak by `preClassify` regardless of its score.
- **Proposed fix, not yet built:** clean up the transcript before scoring, but show the candidate's original words in the transcript and in quotes.
- **Scoring is now consistent.** The evaluator runs at temperature 0, and at 0.2 the same answer varied by up to 0.65. Every other fixture now scores identically across runs.

## Old sessions

Turns and sessions scored before this change keep their STAR keys. They still render with their old labels, group by original question the same way, and score with the formula they were banded with then. Per-dimension trend lines start fresh, because the dimensions changed. The Overall trend spans both, but an old session's figure is the plain mean of its dimensions (what it showed at the time), so a jump at the changeover partly reflects the method, not the candidate.
