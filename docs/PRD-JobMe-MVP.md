# Product Requirements Document: JobMe MVP

## Executive Summary

**Product:** JobMe — Adaptive Mock Interview Room
**Version:** MVP (1.0) · **Status:** Draft, ready for Technical Design · **Last updated:** 2026-09-26
**Hackathon:** Devpost *Build With AI: Basics* (deadline Oct 26, 2026, 4:00 pm CDT), built in a 24-hour sprint
**Owner:** Chawana Kazunda (solo)

### Product Vision
A voice mock interview where the recruiter actually listens. Every follow-up targets the weakest part of your last answer, and a live **recruiter's notepad** shows why.

### Success Criteria
- A judge who watches the 90-second video sees the interviewer respond differently to a weak answer and a strong one, and can read why on the notepad.
- The full arc (sign in → dashboard → setup → live interview → scorecard → history) works with no dead buttons and no raw JSON on screen.

> **Learn Skill Pack mapping.** The headings **The Core Journey**, **Screens and Layout**, **Look and Feel**, **Features and Behavior**, **States and Boundaries**, **Product Decisions**, **What We're Building**, **Deferred From the POC**, **Non-Goals**, and **Open Questions** match `learn-ai-basics/skills/3-prd/templates/prd-template.md`. Use this document as your answers during the `2-scope` and `3-prd` interviews so `devpost/scope.md` and `devpost/prd.md` come out consistent with it.

---

## Problem Statement

### Problem Definition
Mock interview tools ask a fixed list of questions. A vague answer and a sharp answer get the same next question, so candidates never practice the follow-up that exposes a gap, which is the moment that sinks real behavioral rounds.

### Impact Analysis
- **User impact:** Students without access to human mock interviewers (first-gen students, students at schools with thin career-center coverage) get no practice with follow-ups.
- **Differentiation:** Most practice tools either ask fixed questions or give feedback only at the end. JobMe's adaptivity is visible **during** the interview. *(This competitor claim comes from general knowledge, not a fresh scan. Verify it before writing the submission description.)*

---

## Target Audience

### Primary Persona: Dani, CS sophomore applying for SWE internships
- **Profile:** Has one or two projects and a campus job. Has never done a behavioral round with a human interviewer.
- **Jobs to be done:** (1) Practice answering out loud. (2) Find out *which part* of an answer is weak. (3) See improvement across attempts.
- **Current solutions and pain points:**

| Current solution | Pain points | JobMe advantage |
|---|---|---|
| Question lists / flashcards | No follow-ups, no feedback | Follow-ups aimed at the gap in *this* answer |
| Chatbot "act as interviewer" | Typed, unstructured, drifts, no scoring | Spoken, bounded, and scored against a fixed rubric |
| Friend or career center | Scheduling, availability, uneven quality | On demand, consistent rubric, saved history |

### Secondary Persona
Early-career and new-grad candidates preparing for behavioral screens. They use the same track, so the MVP needs nothing extra for them.

---

## The Core Journey
*(Develops `scope.md > The Core Loop`.)*

1. **Arrive.** Dani lands on `/`, reads the one-line pitch, and clicks **Sign in**.
2. **Sign in.** Dani enters an email, receives a 6-digit code, and types it in. Dani lands on the **Dashboard**.
3. **Dashboard.** Dani sees past interviews (empty on first use), per-dimension score trends, and a **Start interview** button.
4. **Setup (under 30 seconds).** The track is fixed: *Behavioral, SWE internship*. Dani confirms the name the recruiter will use, optionally pastes a target role or job description, and allows the microphone. A mic check shows a live level meter.
5. **Interview room.** The recruiter avatar greets Dani by name and asks question 1 aloud. Captions appear under the avatar.
6. **Answer.** Dani holds the talk button (or **Space**) and speaks. A live transcript fills in. On release Dani can **Submit** or **Re-record**.
7. **React.** A short acknowledgment plays right away ("Okay, thanks for walking me through that"). The **notepad** updates with five scores, the detected gap, and the reason for the next move. Then the recruiter asks the next question aloud.
8. **Adapt.** A vague answer gets a **Clarify** probe ("You said the team fixed it. What did *you* change?"). A strong answer gets a **Deepen** probe ("What trade-off did you weigh?"). A resolved topic moves on, one level harder if the thread ended strong.
9. **Wrap.** After all 4 topics are resolved or at the 10-question cap, the recruiter closes the interview and Dani lands on the **Scorecard**.
10. **Scorecard.** Per-question scores, the transcript with gaps highlighted, words per minute and filler count, and a STAR rewrite of the weakest answer.
11. **Return.** On the Dashboard, the new session appears in the list and the trend lines update. **Success:** Dani can see the interview adapted and knows exactly what to fix.

---

## Screens and Layout

| # | Screen | Route | Purpose | Key elements |
|---|---|---|---|---|
| 1 | Landing | `/` | Pitch plus entry point | Headline, 3-step "how it works", **Sign in** CTA. Signed-in users are redirected to `/dashboard` |
| 2 | Sign in | `/login` | Email OTP (already in the starter) | Email → 6-digit code |
| 3 | Dashboard | `/dashboard` | Home and history | **Start interview**, trend chart (5 dimensions), session list (date, questions, avg score, status), delete |
| 4 | Setup | `/interview/new` | Configure and check mic | Track (fixed), display name, optional role/JD textarea, mic check meter, **Begin** |
| 5 | Interview room | `/interview/[id]` | Live interview | Left: avatar, captions, push-to-talk, live transcript, progress ("Topic 2 of 4 · Q5"). Right: **Recruiter's notepad**. **End early** in the header |
| 6 | Scorecard | `/interview/[id]/report` | Results | Summary, per-question score table, highlighted transcript, speaking stats, weakest-answer rewrite, **Back to dashboard** |

```
Interview room (desktop, ≥1024px)
┌──────────────────────────────────────────────┬───────────────────────────┐
│ JobMe · Behavioral SWE Intern   Topic 2/4 · Q5│               [End early] │
├──────────────────────────────────────────────┼───────────────────────────┤
│                                              │  RECRUITER'S NOTEPAD      │
│             ( 2D recruiter avatar )          │  Q4 · Teamwork · Clarify  │
│                                              │  Structure    ███░ 3      │
│   "You said the team fixed it — what did     │  Specificity  ██░░ 2      │
│    *you* change, and what happened after?"   │  Impact       █░░░ 1      │
│                                              │  Ownership    █░░░ 1      │
│  ┌────────────────────────────────────────┐  │  Relevance    ████ 4      │
│  │ live transcript…                       │  │  Gap: Ownership           │
│  └────────────────────────────────────────┘  │  "we worked as a team…"   │
│        [ Hold to talk  (Space) ]             │  → asking what YOU did    │
│                                              │  ─ history of prior notes │
└──────────────────────────────────────────────┴───────────────────────────┘
```
Below 1024px the notepad stacks under the avatar. Mobile only has to "not break."

---

## Look and Feel
*(Proposed direction. Confirm or change it in the `3-prd` design beat. Nothing here was specified in the brief except the 2D illustrated recruiter.)*

- **Feel:** calm, warm, professional. "A good career-center room," not a game and not a sci-fi AI console.
- **Palette:** warm off-white background, deep ink text, one confident accent (teal or indigo) for the talk button and active states. Score colors run from muted red to amber to green, always paired with the number so color never carries meaning alone.
- **Type:** a clean humanist sans (the starter ships Geist) for UI and a mono face for the notepad's quoted evidence.
- **Avatar:** flat 2D illustrated recruiter with idle blink, a listening nod, and a mouth that moves with the voice. Friendly and intentional, not photoreal.
- **Avoid:** purple-gradient AI styling, chat bubbles (this is an interview, not a chat), and walls of text during the live interview.

---

## Features and Behavior

### Accounts and Profile (P0)
- As a candidate, I want to sign in with my email so my interviews are saved to my account.
  - [ ] Email + 6-digit code sign-in works (starter flow). Sign out returns to `/login`.
  - [ ] A profile row exists after first sign-in. The display name defaults to the part of the email before the @ and can be edited on Setup.
  - [ ] Signed-out visits to `/dashboard` or `/interview/*` redirect to `/login`.

### Dashboard and Progress (P0)
- As a candidate, I want to see my past interviews and whether I'm improving.
  - [ ] Completed sessions are listed newest first with date, question count, and average score. In-progress sessions show **Resume**.
  - [ ] A trend chart shows each of the 5 dimensions' session average across completed sessions (needs ≥2 sessions; otherwise a friendly placeholder).
  - [ ] **Delete** asks for confirmation, removes the session, its turns, and its report, and updates the list without a full reload.

### Interview Setup (P0)
- As a candidate, I want to start quickly and know my mic works before the interview.
  - [ ] The track shows as *Behavioral · SWE internship* (single option, not a dead dropdown).
  - [ ] The optional role/JD text (max ~2,000 chars) is saved on the session and used to make question phrasing more specific.
  - [ ] The mic check shows a live level meter. Denied permission shows how to re-enable it and offers **type answers instead**.
  - [ ] Unsupported browsers (no Web Speech API) see "Best in Chrome or Edge" and the typed-answer fallback.

### Interview Room: Voice Loop (P0)
- As a candidate, I want a spoken conversation that feels live.
  - [ ] The recruiter speaks each question aloud with captions. The avatar shows **speaking**, **listening**, and **thinking** states.
  - [ ] Push-to-talk (button hold or **Space**) streams a live transcript. On release: **Submit** / **Re-record**.
  - [ ] An acknowledgment clip starts within ~0.3 s of submit. The next question's audio target is ≤ 2.5 s after submit, to be measured.
  - [ ] If neural TTS fails, the browser voice speaks the question. The interview never goes silent.
  - [ ] **End early** asks for confirmation, then goes to the scorecard for the answered questions (minimum 1).

### Adaptive Engine (P0, the kernel)
- As a candidate, I want the next question to respond to what I actually said.
  - [ ] Each answer is scored 1–4 on **Structure (STAR), Specificity, Impact, Ownership, Relevance**, with a primary gap and a verbatim evidence quote.
  - [ ] Bands: **Weak** (avg < 2.0 or off-topic) → Clarify once, gently. **Great** (avg ≥ 3.5 and no dimension < 3) → Deepen. **Mediocre** (everything else) → Clarify, aimed at the lowest dimension.
  - [ ] A topic resolves when: 2 follow-ups are used; **or** a follow-up raised no dimension by ≥ 1; **or** a Deepen answer was also Great; **or** a Weak thread stayed Weak after its one Clarify.
  - [ ] The next topic starts one difficulty level higher if the thread ended Great (max 3).
  - [ ] Sessions cover 4 of 5 topics (teamwork, handling failure, technical challenge, conflict, learning something fast), run 4–10 questions, and stop hard at 10.
  - [ ] Follow-ups quote or reference the candidate's own words.
  - [ ] The same scripted weak answer and scripted strong answer produce different move types (demo-reproducible).

### Recruiter's Notepad (P0, the differentiator)
- As a candidate, I want to see what the recruiter noticed and why it asked what it asked.
  - [ ] After each answer the notepad shows: question label (topic, move type), 5 score bars with numbers, band badge, primary gap, evidence quote, and a one-line reason ("No measurable result → asking for impact").
  - [ ] It updates before or while the next question audio plays, never after.
  - [ ] Earlier notes collapse into a scrollable history.
  - [ ] No raw JSON, model names, or stack traces ever appear.

### Scorecard (P0)
- As a candidate, I want concrete feedback I can act on.
  - [ ] Per-question table: question, move type, 5 scores, band.
  - [ ] Full transcript. Each answer's evidence quote is highlighted and tagged with its gap.
  - [ ] Speaking stats: words per minute per answer and overall, and filler-word count.
  - [ ] A STAR-form rewrite of the weakest answer that keeps the candidate's facts and invents no new achievements (placeholders like `[metric]` where facts are missing).
  - [ ] The report is generated once, saved, and loads instantly on revisit.

### Persistence and Privacy (P0)
- [ ] Every turn and report is saved to the signed-in user only. Row-level security prevents reading another user's data.
- [ ] Raw audio is never stored or uploaded. Only transcripts, scores, and reports are.
- [ ] Refreshing mid-interview resumes at the current question.

### Should Have (P1, only after the full arc works)
- Embedding-based **repeat avoidance** when choosing the next topic's question.
- Recruiter reads the weakest-answer rewrite aloud on the scorecard.

### Could Have (P2): see **Possible Later Enhancements**.

---

## States and Boundaries
- **First use:** the dashboard shows an empty state ("Your first interview takes about 8 minutes") with **Start interview**. The trend chart shows "Complete 2 interviews to see trends."
- **Mic denied / unsupported browser:** typed-answer mode. Same engine and notepad. The talk button becomes a text box.
- **Empty or very short answer (< 5 words):** not scored. The recruiter says "Take your time. Could you say a bit more?" (doesn't count toward the cap).
- **Off-topic answer:** Weak band with low Relevance, and the gentle Clarify redirects to the question.
- **AI scoring error or timeout:** retry once, then fall back to a neutral Clarify from the seed bank. The notepad says "Couldn't score that one. Let's keep going." The turn is saved as unscored.
- **TTS failure or quota exhausted:** browser voice, with captions unchanged.
- **Refresh mid-interview:** resume at the last unanswered question with the notepad history restored.
- **Abandoned session:** stays *in progress* on the dashboard with **Resume** and **Delete**.
- **Persists:** profile, sessions, turns, reports. **Never persists:** audio.
- **Permissions:** users see only their own data. No sharing in the MVP.

---

## Product Decisions
- **Deterministic state machine owns the flow. The LLM only scores and phrases.** This keeps sessions bounded, predictable, and demo-reproducible.
- **Push-to-talk, not voice-activity detection.** It removes false triggers and interruption bugs, the usual live-demo failures.
- **2D avatar, not a talking-head video API.** It's free, adds no latency, and looks intentional rather than uncanny.
- **Email OTP instead of magic link + Google.** The starter already ships it, and it needs no OAuth app setup. Google sign-in is deferred.
- **Next.js route handlers instead of FastAPI.** The starter is Next.js + Supabase. One codebase and one deploy fits 24 hours better than two.
- **One track only (Behavioral · SWE internship).** Depth over breadth, which serves the Design criterion.
- **Typed-answer fallback** (assumption, added here): it keeps the product complete on mic-denied or non-Chrome browsers without the cost of a Whisper integration.

---

## What We're Building
Everything in **Features and Behavior → P0**: accounts, dashboard with trends, setup with mic check, voice interview room with avatar, adaptive engine, recruiter's notepad, scorecard, and per-user persistence with delete.

## Out of Scope (Not in MVP)
*(Also serves as "Deferred From the POC" in the learn-pack PRD.)*
- **Google sign-in:** OTP already works. OAuth setup costs time without proving the kernel.
- **Automatic voice detection and barge-in:** the highest-risk demo failure mode.
- **Photoreal avatar:** paid, adds latency, uncanny risk.
- **Multiple tracks (technical, PM, etc.):** the kernel is provable with one.
- **Whisper-class server STT:** typed fallback covers unsupported browsers.
- **Mobile layout polish beyond "doesn't break."**
- **Sharing or exporting reports.**

## Possible Later Enhancements
1. **Recruiter personas.** Warm campus recruiter vs. tough senior engineer: same engine, different voice and phrasing prompt.
2. **Company modes.** Paste a JD and the topic bank is reweighted toward its competencies.
3. **Hands-free turn-taking** with VAD and barge-in.
4. **Shareable progress report** (PDF or link) for a mentor or career center.
5. **Technical track.** Verbal system design or "explain your code."

## Non-Goals
- **Not a coding-interview judge.** No code execution or LeetCode grading.
- **Not a hiring signal.** Scores are for practice only and are never presented as predictions of hiring outcomes.
- **Not a free-form chatbot.** The candidate can't steer the conversation. The state machine does.
- **No audio storage or voice analysis beyond pace and fillers.** Privacy by default.

---

## Non-Functional Requirements
- **Latency:** ack clip ≤ 0.3 s after submit. First question audio ≤ 2.5 s after submit (target, measured in build hour 1).
- **Browsers:** Chrome and Edge (latest) for voice. Other browsers get typed mode.
- **Security:** Supabase Auth, RLS on every table (`auth.uid() = user_id`), all API keys server-side only.
- **Accessibility:** captions always on, keyboard-operable (Space to talk, Tab through controls), score colors paired with numbers, visible focus states.
- **Cost:** $0–$10 total. Free tiers only, and neural TTS used sparingly (see Tech Design).
- **Reliability:** no single AI failure can leave the interview silent or stuck.

## Success Metrics (hackathon-scale)
| Category | Metric | Target | Measurement |
|---|---|---|---|
| Kernel | Scripted weak vs. strong answer → different move type | 5/5 runs | Manual demo rehearsal |
| Latency | Submit → first question audio | ≤ 2.5 s median | Timing logged in dev console |
| Completeness | Arc sign-in → scorecard → dashboard with no errors | 3 consecutive clean runs | Manual |
| Presentation | Video shows the weak/strong contrast | Within first 60 s | Video review |

## Risks
| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Slow turns kill the "live" feel | Med | High | Ack clips, fast model tier, one LLM call per turn, measure in hour 1 |
| LLM scores feel arbitrary | Med | High | Strict schema, evidence quote required, embedding cross-check |
| Speech recognition mishears | Med | Med | Transcript shown with Re-record before submit |
| TTS quota runs out during recording | Med | Med | Browser voice in dev, neural voice for demo takes only, static intro/ack clips |
| "Empty folder" rule vs. using the starter repo | Med | High | See Tech Design → *Hackathon Compliance* |
| Scope creep | High | Med | Frozen P0 list. P1 only after 3 clean end-to-end runs |

## Constraints and Assumptions
- **Budget:** $0–$10. **Timeline:** 24-hour build sprint. **Team:** solo.
- **Technical:** must build on `maxMyers13/hackathon-app` (Next.js 16 App Router, TS, Tailwind v4, Supabase) and use the Devpost Learn Skill Pack, with `scope.md`, `prd.md`, and `spec.md` committed.
- **Assumption:** the Chrome Web Speech API transcribes well enough for the demo in a quiet room.
- **Assumption:** Web Speech often drops "um/uh", so filler count is best-effort (it also counts "like", "you know", "basically", "kind of", "actually").

## MVP Definition of Done
- [ ] All P0 acceptance criteria above pass
- [ ] Scripted weak and strong answers reliably produce Clarify vs. Deepen
- [ ] 3 consecutive clean runs of the full arc
- [ ] Deployed on Vercel (optional per rules, useful for the video) or recorded locally
- [ ] `devpost/scope.md`, `prd.md`, `spec.md` committed. 1–3 min demo video recorded. Repo public

## Open Questions
| # | Question | Blocks | Default if unanswered |
|---|---|---|---|
| 1 | Recruiter's name and persona voice? | Tech Design (TTS voice) | "Jordan", warm, neutral voice |
| 2 | Avatar style: illustrated person or abstract face? | Build slice 4 | Illustrated person, flat style |
| 3 | Rewrite read aloud or text only? | No (P1) | Text only |
| 4 | Accent color: teal or indigo? | No | Teal |

---
*PRD Version 1.0 · Owner: Chawana Kazunda · Next: Technical Design*

---
## Handoff Context
<!-- Machine-readable summary for the next workflow step. Do not delete; the next prompt in the workflow reads this block. -->
- Stage: prd
- App name: JobMe
- User level: B  (A = vibe coder, B = developer, C = in-between)
- Target platform: Web (desktop Chrome/Edge primary)
- Budget: $0–$10 total (free tiers)
- Timeline: 24-hour build sprint; Devpost deadline Oct 26, 2026 4:00 pm CDT
- Source files: Callback — Adaptive Mock Interview Room.md (brief) → PRD-JobMe-MVP.md
---
