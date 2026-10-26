---
doc: scope
status: approved
---

# JobMe

A voice mock interview where the recruiter actually listens: every follow-up targets the weakest part of your last answer, and a live recruiter's notepad shows why.

## The Unique Kernel
The interview adapts while you are in it, and you can see why. A vague answer and a sharp answer to the same question get different follow-ups: the vague one is asked for the missing piece ("You said the team fixed it. What did *you* change?"), the sharp one is pushed deeper ("What trade-off did you weigh?"). The AI only scores and phrases; fixed rules choose the next move, so the adaptivity is predictable and the notepad can always explain it.

## Who It's For
Dani, a CS sophomore applying for software internships. Dani has one or two projects and a campus job, and has never done a behavioral round with a human interviewer. Dani wants to practice answering out loud, find out *which part* of an answer is weak, and see improvement across attempts.

Today Dani uses question lists and flashcards (no follow-ups, no feedback), asks a chatbot to "act as an interviewer" (typed, drifts, no scoring), or waits for a friend or the career center (scheduling, uneven quality). Students without access to human mock interviewers — first-generation students, schools with thin career-center coverage — never get to practice the follow-up.

## The Core Loop
Answer a question out loud → the notepad updates with scores, the gap and the quote that shows it → the recruiter asks a follow-up aimed at that gap → answer again. When the interview wraps, a report says what to fix. Dani comes back because every interview is saved, and the trends show whether the weak spots are improving.

## Inspiration & Identity
"A good career-center room": calm, warm and professional — not a game, and not a sci-fi AI console. The product became a small stylized office you walk through: a street outside, an entrance, a front desk with a receptionist, and an interview room with a seated recruiter. Everything you work with is paper: a setup clipboard, a ledger of past interviews, a reports folder, and the recruiter's notepad.

Avoid: purple-gradient AI styling, chat bubbles in the interview (it is an interview, not a chat), and walls of text while the interview is live.

## Why This Matters to the Learner
Mock interview tools ask a fixed list of questions. A vague answer and a sharp answer get the same next question, so candidates never practice the follow-up that exposes a gap — the moment that sinks real behavioral rounds.

## What "Working" Looks Like
Someone watching the demo sees the interviewer respond differently to a weak answer and a strong one, and can read why on the notepad. The weak answer is "We worked as a team and fixed the bug." It gets a clarify follow-up about the candidate's own part. A specific answer with a clear result gets a deepen follow-up instead.

The whole arc works with no dead buttons and no raw JSON on screen: sign in → set up → live interview → report → back to the saved history.

## The POC Boundary
- Accounts, so interviews are saved to one person.
- A quick setup: interview length, and optionally a résumé and the target job.
- The interview room: questions spoken aloud with captions, answers by voice or typing.
- The adaptive engine and the recruiter's notepad.
- A report for each interview, and a ledger of every interview with progress trends.

## Later
- Recruiter personas: a warm campus recruiter or a tough senior engineer, same engine.
- Hands-free turn-taking, with voice-activity detection and barge-in.
- A shareable progress report for a mentor or career center.
- A technical track: verbal system design, or "explain your code".
- The recruiter reading the rewritten answer aloud.

## Explicitly Cut
- **Google sign-in** — email sign-in already works; OAuth setup costs time without proving the kernel.
- **Automatic voice detection and barge-in** — the most likely way a live demo fails.
- **A photoreal or video avatar** — paid, slower, and risks looking uncanny.
- **Server-side speech-to-text** — typed answers already cover browsers without speech recognition.
- **Coding-interview judging** — JobMe is about how you talk about your work, not a code grader.
- **Storing audio** — privacy by default; only text is kept.
- **Sharing or exporting reports** — not needed to prove the kernel.
