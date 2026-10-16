# Interaction flow: arriving, entering, and being shown through

This is the reconstructed flow for JobMe. It adapts the entry gate and first-person movement studied in [feature-analysis.md](feature-analysis.md) to the building. It follows the user from arrival to the moment they sit down in the interview room, and from there back out of the door.

Each step gives the narrative first. Under it, **System** lists what the application is doing, and **Accessible equivalent** describes what the same step looks like to someone who never sees the building. Component names refer to [implementation-plan.md](implementation-plan.md).

---

## 0. Outside

The user arrives at the street in front of the building. The building is dark behind its glass doors. A small brass plate beside the entrance reads **JobMe**, and the lights inside come up one bank at a time as the building gets ready.

- **System:** The route is `/` or `/login`. `BuildingCanvas` mounts. `useBuildingAssets` streams the building model and lightmaps, and `progress` drives the lighting-up. Once the shell is ready, the entrance form is fully usable, even before the 3D building has loaded.
- **Accessible equivalent:** An `<h1>` reads "JobMe: interview practice". A status line reads "Preparing the building… 40%" (`role="status"`, polite, throttled to 10% steps). The "Step inside" button is focusable at once.

**If the building cannot light up** (no WebGL, the model fails to load, or the GPU context is lost): the street is shown as a still illustration and the doors still open. Nothing the user can do is lost. Only the depth is.

---

## 1. At the door: signing in

The user steps up to the door. Beside it is a visitor's book. They write their email address, and a moment later a code arrives for them. They write the code in the book and the door unlocks.

- **System:** `EntranceStation` renders the existing `LoginForm` (Supabase OTP: email, then code). It appears as a card anchored beside the door fixture. A successful `verifyOtp` sets `station = "lobby"` before navigating.
- **Waiting:** While the code is being sent, the pen hovers over the page and the door's small lamp blinks slowly. While the code is checked, the lock turns.
- **Failure:** If the address is refused or the code is wrong, the lock does not turn. The book shows the reason in the secretary's handwriting, and the user writes again. The card stays where it is with focus returned to the field that needs attention.
- **Accessible equivalent:** A form labelled "Sign in" with the fields "Email" and "6-digit code". Errors use `aria-describedby` and appear in the assertive alert region.

A user who is already signed in finds the door open and skips straight to step 2.

---

## 2. Stepping inside

The user pushes the door and walks in. The street noise falls away. The lobby is warm, a long front desk faces the entrance, and behind it the secretary looks up and smiles.

- **System:** This is the gesture that Graffico's "Enter the office" button serves. In JobMe the "Step inside" action is also the **first user gesture**, which unlocks audio so the interviewer's voice (`/api/tts`) can play later without being blocked. `CameraRig` runs the `entrance → lobby` move (1.2 s, ease-in-out). No pointer lock is requested.
- **Reduced motion:** The view cross-fades from the door to the desk in 150 ms. There is no camera travel.
- **Accessible equivalent:** Focus moves to the `<h1>` "Front desk" and the polite region says "You are at the front desk." Keyboard order now starts with the front-desk choices.

---

## 3. At the front desk

The secretary is the user's guide to everything in the building. On the desk is a ledger of the user's past interviews, each one a line with a date and a score. Behind the desk is a filing cabinet of their scorecards. To the left a corridor leads to the interview room. On the wall beside the desk hangs a noteboard.

From here the user can:

| The user… | Which is | Section |
|---|---|---|
| asks the secretary for an interview | starting setup | §4 |
| hands the secretary their resume | resume upload and processing | §4.1 |
| runs a finger down the ledger | interview history, paged | §3.1 |
| asks for a file from the cabinet | an interview's scorecard | §3.2 |
| walks over to the noteboard | preferences | §6 |
| turns back toward the door | signing out | §7 |

- **System:** Route `/dashboard`, `station = "desk"`. `DeskStation` hosts the existing `DashboardSummary`, `SessionList`, `TrendChart` and `Pagination`, styled as the ledger. Every choice above is also a real button or link, so the user does not need to look around to find any of them.
- **Look-around:** The user may drag (or use the arrow keys while the scene has focus) to look left and right, up to about ±35° yaw and ±12° pitch. The view eases back to centre when they let go. Looking around is decoration; nothing can only be reached by looking.

### 3.1 The ledger

The user turns the ledger's pages. Each line is one interview: its date, its mode, and its overall score if it was finished. A small chart in the margin shows how their scores have moved over time.

- **System:** Paging is the existing `?page=` server pagination. Turning a page is a short page-turn on the ledger card, not a camera move.

### 3.2 The filing cabinet

When the user asks for an interview's file, the secretary pulls it from the cabinet and lays it open on the desk: the scorecard, the highlighted transcript and the suggested rewrites.

- **System:** Route `/interview/[id]/report`. The location is **the desk**, not the interview room: the file is a record the secretary keeps, read after the interview is over. If the report is still being written, the secretary says it is being typed up. The `ReportGenerator` state shows as a typewriter at the desk.

---

## 4. Asking for an interview

The user tells the secretary they would like to practise. The secretary takes out a short form. It asks what name the interviewer should use, whether this should be a quick interview or a full one, which role it is for (the user can paste the job description, and the secretary clips it to the form), and whether the user would rather speak or type.

- **System:** Route `/interview/new`, still `station = "desk"`. `DeskStation` hosts `SetupForm` with `ModeSelector`, `ResumeSelector`, `JobDescriptionField` and `MicCheck`. The camera tilts down slightly to the desk surface (400 ms) to show the form; it does not travel.

### 4.1 Handing over a resume

The user hands the secretary their resume. The secretary takes it, reads it through, and files it in the user's folder, then says what stood out: the roles, the projects and the skills the interviewer will be briefed on.

- **System:** `ResumeSelector` and `/api/resume` (PDF via `unpdf`, distil, embed).

| Phase | What the user perceives | What is happening |
|---|---|---|
| Taking | The document passes across the desk | Upload in progress |
| Reading | The secretary reads, turning pages; the folder thickens | Server parse and distil |
| Filing | The folder closes and goes into the drawer; the secretary summarises | Success, and `resumeId` is set |

- **Failure, in the room:** If the document cannot be read (wrong format, too large, empty text), the secretary hands it back across the desk and says why: "I can't read this one. Could you give me a PDF?". The form keeps everything else the user has filled in. The same sentence goes to the assertive alert region.
- **Accessible equivalent:** A file input labelled "Resume (PDF)". A status region announces "Uploading…", then "Reading your resume…", then "Resume saved." Upload errors are announced and linked to the input.

### 4.2 The microphone check

If the user wants to speak, the secretary asks them to say a few words to make sure the user will be heard. A small meter on the desk moves with their voice.

- **System:** `MicCheck` and `onInputModeChange`.
- **Failure:** If the microphone is blocked or silent, the secretary suggests typing instead and the form switches to typed answers, which the user can switch back. This is the existing behaviour, worded as the secretary's suggestion.

---

## 5. Being shown through

The user tells the secretary they are ready. The secretary stands, comes round the desk, and leads the user down the corridor. At the end is a door with a small window. Through it the user can see a table, two chairs and the interviewer, already seated, reading the user's folder.

The secretary opens the door and the user takes the empty chair.

- **System:** `SetupForm` submit → `POST /api/sessions`. **The walk is the wait.** Creating a session prepares a personalised question plan, which takes noticeable time. The walk covers it:

| t | Camera | Request |
|---|---|---|
| 0 ms | Leaves the desk (`desk → corridor`) | `POST /api/sessions` sent |
| ≈ 1.6 s | Arrives at the room door and **holds** | — |
| response | Door opens; `corridor → roomChair` (1.0 s) | `router.push('/interview/[id]?input=…')` |

  If the response arrives before the camera reaches the door, the walk continues without stopping.
- **While holding at the door:** The secretary knocks and the interviewer looks up and gathers the folder. There is no spinner. Idle motion continues as long as the request is in flight.
- **Failure, in the corridor:** If the session cannot be created, the secretary stops, says the room is not ready and the reason (rate limit, network, server), and walks the user back to the desk. The form is still filled in. The return walk is the same path reversed (1.2 s). The error is announced assertively and shown on the form.
- **Reversibility:** Until the door opens the user can turn back ("Not yet"), which cancels navigation. The created session, if any, is left `in_progress` and appears in the ledger. Once the door has opened, leaving means ending the interview (§5.2).
- **Reduced motion:** The corridor is shown as a still for the duration of the request, with the knock as text. Then there is a cut to the room.
- **Accessible equivalent:** "Starting your interview…" in the status region. On arrival focus moves to the `<h1>` "Interview room", and the first thing announced is the interviewer's greeting (captions).

### 5.1 In the interview room

The interviewer greets the user, asks the first question, and listens. A notepad sits on the table in front of the interviewer. As the user answers, they can see notes being taken. A small marker on the table shows how far through the interview they are.

- **System:** `station = "room"`. `InterviewRoom`, `RecruiterStage` (the 3D recruiter, with the SVG version as fallback), `Notepad`, `ProgressPill`, `PushToTalk`, `Captions` and `LiveTranscript`. The room's phase machine (`roomMachine.ts`) is unchanged. The camera is **fixed** at the chair for the whole interview. There is no look-around here, so the user's attention stays on the interviewer.
- **Waiting while the interviewer thinks:** The interviewer glances at the notes (the existing `thinking` pose). There is no spinner.
- **Failure:** A failed turn submit becomes the interviewer saying they didn't catch that, using the existing friendly `error` text. A `resyncing` state means the interviewer pauses and checks the notes while the page reloads server state.

### 5.2 Leaving the room

When the interview is finished, the interviewer thanks the user and stands. The user walks back down the corridor to the desk, where the secretary says the file will be ready shortly. If the user leaves early, the interviewer asks once whether they are sure, then lets them go.

- **System:** `done` → `room → corridor → desk` (2.2 s), then route `/interview/[id]/report` (§3.2). Leaving early uses the existing `EndInterviewDialog`, presented as the interviewer's question.

---

## 6. The noteboard

On the wall beside the front desk hangs a cork noteboard. Pinned to it are cards with the user's standing preferences: how they like to answer (speaking or typing), the interview length they usually want, and how the building itself behaves (motion, and a simpler view for slower computers). The user unpins a card, changes it, and pins it back.

- **System:** `station = "noteboard"`, reached from the desk with a 600 ms side-step. `NoteboardStation` holds the preference form. Saving pins the card; the pin pressing in is the confirmation. If saving fails, the card stays in the user's hand with the reason written on a sticky note, and the error is announced.
- **Accessible equivalent:** A region titled "Settings" with ordinary labelled controls and a "Save" button.

Section 4 of the implementation plan explains why the board is in the lobby and not in the interview room.

---

## 7. Leaving the building

The user turns from the desk and walks back to the front door. The secretary says goodbye. The door closes behind them, and the lights in the lobby dim.

- **System:** The "Leave" action sets the `desk → entrance` camera move (1.2 s), then submits the existing `POST /logout` form, which signs out of Supabase and redirects to `/login`. The building is shown from outside again (§0).
- **Failure:** If signing out fails, the door does not latch. The user is still inside and the secretary says something went wrong. They can try again.
- **Reversibility:** This is not reversible in place. Coming back in means signing in again at the door. For that reason the "Leave" action names its consequence: "Leave the building (sign out)".
- **Accessible equivalent:** A form button "Sign out". The announcement is "Signed out."

---

## Ending states

| State | Location | Route |
|---|---|---|
| Not signed in | Outside, at the door | `/login` (and `/` when signed out) |
| Signed in, idle | Front desk | `/dashboard` |
| Preparing an interview | Front desk, form out | `/interview/new` |
| Interviewing | Interview room, seated | `/interview/[id]` |
| Reading a scorecard | Front desk, file open | `/interview/[id]/report` |
| Changing preferences | Noteboard | `/settings` (proposed) |
