---
doc: prd
status: approved
---

# JobMe — Product Requirements

JobMe is a voice mock interview for students practicing for internship and early-career interviews: the recruiter asks follow-ups aimed at the weakest part of each answer, and a live notepad shows why.
Source: `scope.md > The Unique Kernel`, `scope.md > The Core Loop`, `scope.md > Who It's For`.

## The Core Journey
*(Develops `scope.md > The Core Loop`.)*

1. **Arrive.** Dani opens JobMe and lands on a street outside the JobMe building. The sky and the street sounds follow the time of day. Dani clicks **Step inside**.
2. **Sign in.** At the entrance Dani creates an account (email, password and a unique username, which comes with a member code) or signs in.
3. **Front desk.** The receptionist, Ms. Crystal, greets Dani — as a first-time visitor or as a returning one. On the desk are the setup clipboard, the ledger of past interviews and the reports folder.
4. **Set up.** Dani picks up the clipboard and chooses **Quick** or **Full**. Optionally Dani adds a PDF résumé (or reuses one), a target role, a company, and a pasted job description or a posting link. Dani runs the optional microphone check or chooses typed answers, then begins.
5. **Interview room.** The camera moves to the interview room. The seated recruiter greets Dani by name and asks the first question aloud, with captions.
6. **Answer.** Dani clicks the microphone (or presses **Space**) and speaks, watching the live transcript, then clicks again to send. A voice answer also sends after 10 seconds with no new words. Dani can type instead and send with **Ctrl/Cmd+Enter**.
7. **React.** The notepad gains an entry: the scores, the answer's band, the gap, a quote from the answer that shows it, an observation, and the reason for the next question. Then the recruiter asks the next question aloud.
8. **Adapt.** An answer that needs work or is still developing gets a **clarify** follow-up aimed at its gap. A strong answer gets a **deepen** follow-up. A finished topic moves on — one level harder if it ended strong.
9. **Wrap.** When the question cap is reached or the topics run out, the recruiter closes the interview. Dani can also **End early** after at least one answer.
10. **Report.** Dani reads the report: a summary, the overall and per-question scores with the interviewer's notes, what went well and what to work on, a stronger version of the weakest answer, filler counts and speaking rate.
11. **Return.** The ledger holds every interview word for word, with progress trends at the front. Dani can resume an unfinished interview or delete one. **Success:** Dani saw the interview adapt and knows exactly what to fix.

## Screens and Layout
JobMe is one 3D building. Each page is a place in it, and the camera moves between them. Paper documents are lifted to the camera to be read and filled in, and their pages turn like a book.

| Place | Route | What's there |
|---|---|---|
| Street | `/` | The building, a tagline, signposts, the **Step inside** tile, the time-of-day sky and street sounds. Signed-in visitors continue to the desk. |
| Entrance | `/login` | Sign in and create an account. |
| Front desk | `/dashboard` | The receptionist, the setup clipboard, the ledger (`?open=ledger`) and the reports folder. A notice board holds preferences. |
| Setup clipboard | `/interview/new` | Mode, résumé, job details, microphone check, **Begin**. |
| Interview room | `/interview/[id]` | The seated recruiter, captions, the microphone or typed input, progress, the notepad, **End early**. |
| Report | `/interview/[id]/report` | One interview's report, in the reports folder. |
| Reports folder | `/reports` | The latest report, with tabs to the others. |
| Settings | `/settings` | Display name and defaults saved in this browser. |

Keyboard controls, reduced-motion handling and 2D fallbacks (the desk's buttons and a flat recruiter) keep JobMe usable without the full 3D scene.

## Look and Feel
- **Feel:** calm, warm and professional — a good career-center room, not a game and not a sci-fi AI console.
- **The office:** a stylized, softly lit building. Every surface has a named finish (wood, stone, plaster, fabric) lit by one warm key light with soft shadows.
- **Paper:** the clipboard, ledger, folder and notepad look like real paper, with grain, lit from the same side as the office.
- **Palette:** warm off-white ground, deep ink text, one teal accent for actions and active states. Score colors run from red to amber to green and are always paired with the number, so color never carries meaning alone.
- **Type:** friendly hand-lettered type — Comic Sans, with Comic Neue as the fallback and for the building's 3D lettering — and a mono face for quoted evidence.
- **Avoid:** purple-gradient AI styling, chat bubbles in the interview, walls of text while the interview is live, and raw JSON anywhere.

## Features and Behavior

### Accounts and Profile
- Sign up with email, password and a unique username; each account gets a member code. Sign in with email and password.
- Signing out returns to the entrance; the receptionist says goodbye.
- Signed-out visits to the desk, an interview or a report go to the entrance.
- Settings edit the display name the recruiter uses and save interview and input defaults in this browser.

### Front Desk and Receptionist
- Ms. Crystal greets first-time visitors with one of four welcomes and returning visitors with one of four welcome-backs, and sees visitors off at sign-out with one of four goodbyes.
- She greets once per sign-in, not each time the user comes back to the desk from an interview, and says goodbye only when the user chooses to sign out.
- A speech bubble shows exactly what she says, her lips move with her voice, and she never says the same line twice in a row.
- Someone who has interviewed before counts as returning, even on a new browser.
- The lobby music plays quietly at the desk, waits while she speaks, and can be turned off on the preferences note.

### Interview Setup
- **Quick:** up to 10 questions. **Full:** sized to the résumé, from 8 to 30 questions.
- The résumé is optional. It must be a text-based PDF under 4 MB; a saved résumé can be reused.
- Job details are optional: a target role, a company, and a pasted job description or a link from Greenhouse, Lever, Ashby or SmartRecruiters.
- The microphone check shows a live level. If the microphone is denied or speech recognition is unsupported, typed answers are offered.
- Setup says that the browser's speech recognition may process audio remotely, and that JobMe keeps text, never audio.

### Interview Room: Voice Loop
- The recruiter speaks each question aloud, with captions and lip-sync.
- Voice answers: click the microphone or press Space to start and to send; the transcript fills in live; a voice answer also sends after 10 seconds without new words. The microphone is off while the recruiter speaks.
- Typed answers: an editable box, sent with Ctrl/Cmd+Enter.
- If speech recognition fails, the room switches to typed answers. If the neural voice fails, the browser's voice speaks instead. The interview never goes silent.
- A failed request can be retried without losing the answer.
- **End early** asks for confirmation, then files a report for the answers so far (at least one).

### Adaptive Engine (the kernel)
*(Implements `scope.md > The Unique Kernel`.)*
- **Question order:** every interview opens with motivation ("Tell me a bit about yourself and what draws you to this role."), then the role's own question — technical knowledge for software roles, product sense for product roles, data reasoning for data roles, none for other roles — then behavioral competencies such as teamwork, conflict, handling failure and learning fast. Résumé questions are mixed in when there is a résumé.
- **Scoring:** each answer is scored 1–4 on the dimensions that fit its kind of question:
  - stories (behavioral and résumé): relevance, specific evidence, own contribution, reasoning, outcome, clarity;
  - technical and problem-solving: relevance, accuracy, reasoning, specific evidence, clarity;
  - motivation: relevance, specific evidence, reasoning, clarity.
- **Bands:** **Needs work** (weighted score below 2.0, or off-topic), **Strong** (3.5 or above with no dimension below 3, clarity excepted), **Developing** (everything else).
- **Moves:** Needs work or Developing → clarify, aimed at the gap. Strong → deepen. A follow-up adds to the original answer: the combined answer is scored against the original question, so a follow-up can fill a gap but never removes credit.
- **Moving on:** the candidate says they have no such experience; the answer stops improving; a deepen lands Strong; two weak answers in a row; or the follow-up limit is reached (two per topic, one for motivation and for résumé topics in Full mode).
- **Fairness:** substance over format — STAR is never required, numbers are never required, saying "we" is fine when the candidate's part is clear, and transcripts are read charitably. Grammar, accent and filler words are never penalized.
- **The AI never chooses the move.** It scores and words questions; fixed rules decide.

Works when:
- The demo's weak answer and a strong answer to the same question produce different moves.
- Follow-ups refer to the candidate's own words.
- An interview never exceeds its question cap.

### Recruiter's Notepad
- After each answer the notepad shows: the question's topic and move, every scored dimension as a bar with its number, the band, the gap, a quote from the answer, an observation, and a one-line reason ("No measurable result → asking for impact").
- It updates before or as the next question is spoken, never after.
- Earlier entries stay on its pages as the answer's progress.
- No raw JSON, model names or error traces ever appear.

### Report
- A summary; up to three strengths, each quoting the candidate's own words (checked); up to three things to work on, each with a recommendation and tied to a question.
- A stronger version of the weakest answer, built only from the candidate's facts, with `[placeholders]` where facts are missing. STAR is used only for stories.
- Overall and per-question scores with the interviewer's notes. Each question is scored by its latest, most complete evaluation.
- Approximate filler counts and, for voice answers, speaking rate.
- Generated once and saved, so a revisit loads straight away.

### Ledger and Progress
- Every interview, question by question and word for word, with follow-ups under the question they added to.
- Trends across the latest 20 completed interviews, at the front of the ledger.
- Unfinished interviews can be resumed. An interview can be deleted from the ledger or from its report, and it leaves both.
- The ledger points to the report for scores and feedback; the report points to the ledger for the transcript.

### Persistence and Privacy
- Every session, turn and report belongs to the signed-in user only; nobody can read another user's data.
- Microphone audio is never uploaded or stored by JobMe.
- Résumé PDFs are read on the server and not kept. Identifying details are redacted from their text before it is stored or sent to the AI, while numbers that show impact are kept; redaction is not a guarantee of anonymity.
- Refreshing mid-interview resumes at the current question.

## States and Boundaries
- **First use** — the ledger opens on an empty page; trends appear once interviews are completed.
- **Microphone denied or speech recognition unsupported** — typed answers, with the same engine and notepad.
- **Very short answer (under 5 words)** — not scored or counted: "Take your time. Could you say a bit more?"
- **Off-topic answer** — Needs work with low relevance; the clarify follow-up steers back to the question.
- **AI scoring fails or times out** — the conversation keeps moving on rules; the turn is saved as unscored and left out of averages.
- **Tailoring fails but job details were given** — the interview uses the role's default questions, and the recruiter says the job details couldn't be used.
- **Report text fails** — the report is still filed, with a summary and improvements built from the scores.
- **Neural voice fails or runs out** — the browser's voice speaks; captions are unchanged.
- **Unreadable résumé** — a scanned or image-only PDF yields no usable text, and setup says so; there is no OCR.
- **Abandoned interview** — stays in the ledger, ready to resume or delete.
- **What persists** — account, profile, sessions, turns, reports, and redacted résumé text with its facts. **Never persists** — audio and résumé PDFs.
- **Permissions** — each user sees only their own data. Nothing is shared.

## Product Decisions
- **Fixed rules own the flow; the AI only scores and phrases** — keeps every interview bounded, predictable and repeatable for the demo.
- **Click or Space to talk, plus a 10-second silence send, no voice-activity detection** — avoids false triggers and interruptions, the usual live-demo failures.
- **Typed answers as the fallback** — keeps the product complete without a server speech-to-text service.
- **No video or photoreal avatar** — free, no added delay, and intentional rather than uncanny. The plan was a flat 2D recruiter; the build became a stylized 3D office with a seated recruiter, and the flat recruiter stayed as the fallback.
- **Email and password with usernames** — the plan used email codes from the starter; the build switched to passwords with unique usernames and member codes. Google sign-in stays deferred.
- **Rubric by question kind instead of STAR dimensions** — an audit found voice answers marked down for their format, not their substance (`docs/Scoring-Rubric.md`). Each kind is now scored on what shows that competency.
- **Résumé and job context** — added so questions are about the candidate's own experience and the job they want, while the interview stays behavioral at its core.

## What We're Building
Everything under **Features and Behavior**: accounts, the street and front desk with the receptionist, setup with an optional résumé and job, the voice interview room with its recruiter, the adaptive engine, the recruiter's notepad, the report, the ledger with trends, and per-user persistence with delete.

## Deferred From the POC
- **Google sign-in** — email sign-in works; OAuth setup doesn't prove the kernel.
- **Password reset and account deletion screens** — accounts work without them for a demo.
- **Sharing or exporting reports** — no sharing in this version.
- **Spoken report rewrites** — text is enough to act on.
- **Instant acknowledgment clips and voice prewarming** — planned for responsiveness; not built yet.
- **OCR for scanned résumés** — text-based PDFs only.
- **More job-posting sites** — other jobs can be pasted as text.

## Possible Later Enhancements
- **Recruiter personas** — same engine, a different voice and phrasing.
- **Hands-free turn-taking** — voice-activity detection and barge-in.
- **Shareable progress report** — a PDF or link for a mentor or career center.
- **Technical track** — verbal system design or "explain your code".
- **Transcript clean-up before scoring** — fix misheard words for scoring while showing the candidate's original words.

## Non-Goals
- **Not a coding-interview judge** — no code execution or LeetCode grading.
- **Not a hiring signal** — scores are for practice and never presented as predictions of hiring outcomes.
- **Not a free-form chatbot** — the candidate can't steer the conversation; the rules do.
- **No audio storage or voice analysis beyond pace and fillers** — privacy by default.

## Open Questions
- **Garbled transcripts still score a little lower than clean ones** when the job context names a company (`docs/Scoring-Rubric.md > Known residual`). The proposed fix is under **Possible Later Enhancements**. Doesn't block `4-spec`.
