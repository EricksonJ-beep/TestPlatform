# Bloom — Assessment Platform Build Plan & Spec (v2)

*Author: Jonathan Erickson · Audience: you + Claude Code · Updated: Sept 15, 2026*
*Name **Bloom** is final: Bloom's taxonomy (the `bloom` tag on every question) + students growing through the relearning cycle. Register the domain you'll use (a `.app` or `.school` is fine — expect `bloom.<something>`, not `bloom.com`).*
*v2.1 (Sept 21, 2026): infrastructure switched to **Neon + Drizzle + Auth.js + R2** (see §7). v2 changes: added the learning cycle (formative/summative attempts + corrections + retakes), **targeted summative retakes by learning target (80% threshold)**, **live tier board**, practice sets, student auth decision, import moved to Phase 1, two-teacher sharing at launch.*

---

## 0. How to read this document

This is the master spec. In VS Code, start Claude Code and tell it to **read PLAN.md** before writing any code. Build **phase by phase** (§9) — Phase 1 is the target for "students taking real tests online."

**The whole-system analogy:** you're building a small school. A *front office* checks IDs and enforces rules (backend + auth), a *records room* of locked filing cabinets holds everything (database), an *AV closet* stores images and videos (file storage), and the *classrooms* are what you and students actually click around in (frontend).

---

## 1. Vision & guiding principles

**What it is:** A web platform where you and a colleague build standards-aligned assessments from deep question banks, deploy them to students online, auto-grade them, and — the differentiator — run a **learning cycle** where students correct mistakes and retake to show growth.

**What makes it better than EasyTestMaker:**

| EasyTestMaker | Bloom |
|---|---|
| Flat list of tests | Organized by course → unit → learning target |
| Questions trapped inside tests | Reusable **question bank**; tests assembled from it |
| One-and-done testing | **Attempt → corrections → retake** learning cycle |
| No practice mode | Always-open **practice sets** |
| Basic images | Images, graphs, video, image-hotspot questions |
| Manual authoring only | Manual **+ import from Word/PDF + AI generation** |
| Single user | Two-teacher sharing from day one, more later |

**Guiding principles**
1. **Question bank first, tests second.** Write a question once, reuse it forever.
2. **Tag everything** — learning target, standard, difficulty, Bloom's level, topic.
3. **Highest score counts, always.** Students are never punished for trying again.
4. **Corrections are a gate, not busywork.** No retake until corrections are done.
5. **Private by default, shared by choice.**
6. **Honest security** (§6).

---

## 2. Assessment types (first-class concept)

Every assessment has a **type**, and the type drives the rules. This is the core new idea in v2.

| Type | Attempts | Gate before next attempt | Grade recorded | Where students see it |
|---|---|---|---|---|
| **Practice** | Unlimited | None | Not graded (tracked for you) | "Practice" tab, always open |
| **Formative** (quiz) | Default 3 (configurable) | **Corrections** on missed questions | **Highest** attempt | "Assignments" when open |
| **Summative** (test) | 1 + 1 retake (configurable) | **Three gates per target: corrections approved → relearning activity completed → practice set completed**, then a **targeted retake** with new questions from each target's pool. Targets **below 80% are required** ("Must retake"); targets **at/above 80% are optional** ("Retake available") | **Highest per target**, combined | "Assignments" when open |

**Formative retake:** same assessment; may be re-randomized (order/answers) but same question set unless you attach a pool.
**Summative retake (targeted):** a summative is built as **one section per learning target**, each backed by its own pool. After attempt 1, the platform scores each target separately. Any target below the **80% threshold** (configurable) is labeled **Must retake** — the platform assigns it automatically, no teacher action needed. Targets at or above 80% are labeled **Retake available**: the student may opt in to any of them to raise the score. The retake serves a fresh set of questions for *only the selected targets*, the same number as the original section. Example: 10/10 on LT1–LT3 and 7/10 on LT4 → LT4 is required; the student may also choose LT1–LT3 but doesn't have to.

---

## 3. Core feature set

### 3.1 Question types
- Multiple choice (single) · Multiple select (partial credit optional) · True/False
- Matching · Ordering/sequencing · Fill in the blank (accepted-answer list) · Numeric (grading modes: **exact · ± tolerance · % tolerance · range**; **unit-aware** so `15 m/s`, `15m/s`, and `15` all match when a unit is set)
- Short answer (keyword auto-grade or manual) · Extended response (manual, rubric)
- **Image hotspot** ("click the mitochondria")
- Any type can attach an **image, graph, or video** to the stem

### 3.2 Question authoring
- Rich text (sub/superscript for H₂O and CO₂, LaTeX for equations)
- Image upload + crop; video upload or YouTube link
- **Shared stimulus** — a passage, image/graph, video, or audio clip attached once to a *group* of questions. In the test view it renders once with its questions beneath (or pinned while paging through them one at a time). Replaces repeating the same graph on Q72 and Q73. A stimulus travels with its question group when the group is placed in a pool, so a retake can draw a whole stimulus set. Stimuli are reusable across assessments.
- **Dynamic numeric variants** — write a numeric question as a template with variables and ranges (`A car travels {d} m in {t} s. Average speed?` with `d: 80–200 step 10`, `t: 4–12 step 1`, answer `= d / t`). Generate N variants into a pool in one click; each variant is stored as a real question (tagged to the template) so retakes, pools, and analytics work unchanged. Physical science pools go from thin to deep in minutes.
- Per-question: points, difficulty 1–5, Bloom's level, **learning target(s)**, standard(s), unit/topic, private notes
- Answer feedback/explanation shown after grading
- Version history

### 3.3 Question banks & pools
- Banks organized course → unit → topic; hundreds of questions per topic
- Filter by any tag combination ("Hard + Analyze + Circulatory + target 3.2")
- Bulk tag/move/duplicate
- **Question pools:** a named set; assessments can say "draw N from pool X." Pools are what make summative retakes and per-student randomization work. **Pools must be tagged to learning targets** so a retake covers the same targets.

### 3.4 Assessment builder
- Hand-pick from bank, drag from bank, or **blueprint** ("8 MC easy + 4 short answer from Unit 3 pool, targets 3.1–3.3")
- Sections with instructions; drag-and-drop reorder; points auto-total
- Set the **type** (Practice / Formative / Summative) and its attempt policy
- **Summatives are built as one section per learning target**, each section backed by a pool for that target ("Section: LT4 — draw 10 from pool LT4"). This is what makes targeted retakes possible; the builder should nudge you toward it when type = summative
- Randomize question order and/or answer order; auto-generate versions from pools
- Preview as student; print preview

### 3.5 Import (moved to Phase 1)
Your existing material is the fastest path to a full bank:
- **Anatomy:** pre-built question banks → CSV/text bulk import
- **Biology:** past tests in **Word/PDF** → AI-assisted parser extracts questions + answer keys → you review/confirm each before it enters the bank
- Simple text format (Aiken/GIFT-style) for fast paste-in
- *Later:* QTI import

### 3.6 AI generation (Anthropic API)
- Generate from a topic, pasted notes, a standard, or an uploaded chapter
- Controls: count, type mix, difficulty, Bloom's level, reading level (9th–12th + med-term)
- Generate distractors for a stem you wrote; generate alternate versions; generate explanations
- **AI first-pass on corrections** (§4): flags weak explanations for you; never auto-scores them
- **Human-in-the-loop always** — AI drafts, you approve. Use a fast/cheap model for bulk drafting, a stronger one for hard items.

### 3.7 Practice sets and relearning activities
Two kinds of published content live in the student's **Practice** tab, both tagged to learning targets.

**Practice sets** (questions)
- You build and **publish** curated sets per target/topic from the bank (or a pool)
- Always visible to enrolled students; unlimited attempts; instant feedback with explanations; not graded
- **Completion** = every question in the set answered once. Best % is tracked for you and shown to the student.

**Relearning activities** (learning, not testing)
- A teacher-published item tagged to a target, one of: **video** (YouTube or upload), **reading** (rich text page you write or paste), **worksheet** (one of Jon's Apps Script interactive worksheets — see §3.7a), **external link** (a Google Doc, Slides, EdPuzzle, etc.), or **guided notes** (a page with 2–5 short-response prompts).
- **Completion** rules: video → watched to ≥90% (player events) · reading → scrolled to end + "I finished" · **worksheet → final submit received from the worksheet itself (verified, no honor system)** · external link → opened + "I finished" (optionally teacher-verified) · guided notes → all prompts answered.
- Activities are reusable across assessments and can be sequenced ("watch this, then do these notes").

### 3.7a Apps Script worksheet integration
Jon's interactive worksheets (Apps Script web apps: per-problem Check with unlimited tries, hint after 3 misses, autosave by Cadott Google login, a response Sheet, and a row in the **Worksheet Index**) become first-class Bloom content without rebuilding them.

**How a worksheet talks to Bloom (push, real-time):** a small optional block in each worksheet's `Code.gs` (Appendix B) POSTs to Bloom's `/api/integrations/worksheet` endpoint on every **final submit** (and optionally on each autosave) with: the script ID, worksheet title, the student's Cadott email, score, per-section scores, and a timestamp, signed with a shared secret. Bloom matches the email to the student account and the script ID to the registered worksheet, records a completion, and recomputes retake gates — the tier board updates live.

**Identity rule this depends on:** every student's Bloom account email **must be their Cadott Google email** (the roster CSV / Google Classroom import both provide it). Login remains email + password.

**Registering a worksheet in Bloom** (Phase 1, manual): paste the student link (or script ID) → title auto-filled on first webhook → choose **counts as:** practice set · relearning activity · both (default: practice set, because worksheets are problem sets) → tag learning target(s). If the worksheet's section titles carry LT labels (the Physical Science convention), Bloom offers a **section → target map** so one multi-part worksheet can satisfy the gate for each target separately (a student who finished Part D: LT4 gets LT4 credit even if Part A is blank).
**Phase 2:** "Sync from Worksheet Index" — Bloom reads the Index sheet via the same Google OAuth used for Classroom rostering and registers new worksheets automatically; old worksheets just need a **New version** redeploy after the webhook block is added.

**Completion = final submit received** (any score), matching the completion-not-score rule. A per-assignment option can require ≥N% on the worksheet if Jon ever wants it. Bloom also stores cards-correct and total checks from the payload so the relearning monitor can show "worksheet: 12/15 correct, 41 checks, hint used on 3."

**Going forward, every new worksheet is built Bloom-ready:** LT label in each section title, webhook block filled in, and registered in Bloom the same day it's posted to Classroom.

**As retake gates:** for each *required* target, the student must complete **at least one relearning activity and at least one practice set** tagged to that target (any of them by default; you can pin specific ones per assignment). Optional targets the student opts into follow the same gates. This is why "Suggested before your retake" appears on the student home — the platform shows exactly which items would satisfy the gate.

### 3.8 Deployment & student delivery
- Assign to a class with an open/close window
- Access code, time limit (server-enforced, autosubmit), attempt policy from type
- Clean student test screen: one-at-a-time option, progress bar, **autosave** every answer
- Accommodations: extended time per student, font scaling
- **Google Classroom roster import** — teacher connects Google (OAuth, read-only Classroom rosters) and imports a class's names + emails; Bloom then creates the email/password student accounts exactly as the CSV path does. Login stays email/password; this only skips typing rosters. Re-import syncs new students.
- Print/PDF/Word export for paper and subs

### 3.9 Grading & results
- Auto-grade objective items; manual queue for written items with rubric
- Override any score
- Gradebook per assignment: student, attempts, each score, **highest (bold)**, corrections status, finished time
- Per-student review: answer vs. correct, plus their corrections
- **Skyward:** no direct integration in v1. The platform tracks the highest score and produces a **CSV export** formatted for easy entry/upload. (A real Skyward integration needs district admin approval — revisit later.)

### 3.10 Analytics
- Item analysis (which questions everyone missed → bad question or real gap?)
- Distractor analysis (which wrong answers lure students)
- **Learning-target mastery** per class and per student
- **Growth view:** attempt 1 vs. retake — this is the report that proves the learning cycle works
- Class-to-class comparison

### 3.11 Live tier board
A per-assignment (summative) view that groups students by how many learning targets they still need to retake, and updates **live** as they move through the relearning cycle.

- **Tier 1 · Proficient** — 0 targets below the threshold (default 80%)
- **Tier 2 · Targeted relearning** — 1–2 targets below threshold
- **Tier 3 · Needs intervention** — 3 or more targets below threshold
- Tier boundaries are configurable per assignment (defaults above).
- Each student card shows: initials/name, the targets below threshold (**required**, coral) and any optional targets the student opted into (**optional**, gray) with their %, and their **relearning stage**: `attempt 1 done → corrections not started → corrections in progress (n of m) → corrections submitted (awaiting approval, if that mode) → retake ready → retake in progress → retake done`.
- Tier is recomputed from **per-target best scores** after every event (submission, correction, approval, retake), so a student moves columns the moment a retake lifts a target over the line. Cards that moved up get a "moved up today" marker.
- Header stats: students per tier, retake window status, threshold. Footer: "N students moved up a tier this week," and the **most-missed target** (the one to reteach).
- Click a card → the **Relearning monitor** for that student (below). Click a target chip → item analysis for that target.
- **Relearning monitor (per student):** one screen showing everything they've done since attempt 1, per target: attempt-1 score; corrections (n of m submitted / approved / returned, with a link to read them); **practice activity on that target** (which practice sets tried, attempts, best %, last active); time on task; and retake status. A **readiness** line summarizes the three gates — e.g. "LT4: corrections ✓ · activity ✓ (watched blood-flow video) · practice ✓ (best 85%) · **retake unlocked**" or "LT4: corrections returned · activity not started · practice 0/1" — so you can see at a glance who is actually relearning versus who is waiting to guess again. Same data feeds a class-level table (one row per student, one column per target) sortable by readiness, so you can call up the not-ready students first.
- Practice sets tagged to a student's required targets are auto-suggested on their home screen ("Suggested before your retake") and their activity flows back into the monitor.
- Filter by class period; option to show a whole course across periods.
- **Live updates** by polling the board's data every 5–10 seconds (SWR/React Query), keyed on `attempts`, `corrections`, and `assignment_final_scores`; true push via Pusher/Ably later if wanted — the board is intended to be projected or left open on a second screen during relearning days.
- Same tiering logic powers a compact "class at a glance" strip on the Dashboard.

### 3.12 Sharing (two teachers at launch)
- Each teacher has their own account and private banks
- A **shared Physical Science bank** both you and your colleague can view/edit, with a simple per-bank permission (view / copy / co-edit)
- Assessments can be shared or copied
- Built on the server-side authorization layer + `shares` table, so adding more colleagues later is a settings change, not a rebuild

---

## 4. The learning cycle in detail (formative & summative)

This is the workflow Claude Code must implement exactly.

**Corrections requirement (decided):** for each missed question the student must **(a) write the correct answer and (b) explain in their own words why it's correct / why their answer was wrong.**

**Flow**
1. Student submits attempt 1 → auto-grade → score shown (or withheld until you release).
2. For every **required** target (and any optional one the student opts into), a **Relearning checklist** appears with three items per target: **Corrections** (every missed question with its stem, their answer, and two fields: *Correct answer* + *Why*), **Relearning activity** (pick any tagged activity, or the one you pinned), and **Practice set** (complete one tagged set). Items can be done in any order except that the retake needs all three.
3. Student submits corrections.
4. **Review gate** (corrections only) — choose per assignment:
   - *Auto:* corrections submitted → retake unlocks immediately (fast, low-friction), or
   - *Teacher-approved:* you (with an AI first-pass flagging thin explanations) approve → retake unlocks.
5. Retake:
   - **Formative:** same assessment, up to the attempt limit (default 3). Corrections required before each retake.
   - **Summative (targeted):** the platform marks every target below the threshold (default **80%**) as **required** and every target at/above it as **optional**. The student sees both lists and confirms which optional targets (if any) to add. The retake serves **new questions from each selected target's pool**, matching the original section size. One retake by default.
6. **Highest score** becomes the recorded grade. For summatives this is computed **per target**: each target's final score = max(attempt 1, retake), then targets are summed into the test score. All attempts + corrections are kept for the growth view.

**Worked example (summative, 4 targets × 10 pts):**
Attempt 1 → LT1 10, LT2 10, LT3 10, LT4 7 = 37/40 (92.5%). LT4 is 70% → below 80% → corrections on the 3 missed LT4 items → retake = 10 new LT4 questions → scores 9. Final = 10+10+10+**9** = 39/40.

**Rules**
- Corrections are required on the *missed* items within the targets being retaken (all missed items for formatives).
- None of the three gates can be skipped — the retake button stays locked until corrections are submitted (and approved, if that mode is on), one relearning activity is complete, and one practice set is complete for **every** target being retaken. Practice is completion-based, not score-based.
- A target can never score lower after a retake (highest per target).
- Threshold (80%), attempt limits, and review mode are set per assignment (defaults per type). Optional retakes for targets ≥80% are **on by default** (can be disabled per assignment).
- If **every** target is ≥80%, nothing is required; the student may still opt into a retake on any target. Corrections are required on missed items in every target being retaken, required or optional.

---

## 5. Screens (UX)

Layout: **teal left sidebar** (Dashboard · Question banks · Assessments · Practice sets · Assign · Results · Classes · Shared · Settings), top bar with global search + course/term switcher, main content area. Mobile/Chromebook-friendly; the student view especially.

**Teacher screens**
1. Dashboard — needs-grading count, corrections awaiting approval, open tests, recent results
2. Question banks — tree + filterable list, edit panel slides in
3. Assessment builder — bank on left, test on right, drag across; type + attempt policy settings; blueprint & AI buttons
4. Practice sets — build/publish
5. Assign — test → class → window/code/time/attempts
6. Results — gradebook with attempts + highest; per-student review incl. corrections
6a. **Corrections approval queue** — for assignments in teacher-approved mode: one card per submitted correction set (student, test, targets, AI first-pass flag), expand to read each correction, approve all / send back with a note; keyboard-fast (A approve, R return). Approving unlocks the retake instantly and updates the tier board.
6b. **Tier board** — live three-column board (Tier 1 / 2 / 3) per summative; see §3.11
7. Analytics — mastery, item/distractor analysis, growth
8. Classes — rosters, add students, **reset a student's password**

**Student screens** (designed — mockups reviewed Sept 2026)
1. **Login** — email + password; "forgot password" routes to teacher reset, not email.
2. **Home** — three tabs: Assignments · Practice · My results. Header: "Hi, {first name}" + "{n} things need your attention."
   - Each assignment is a card with a **status pill** and **one action button**; the pair changes together. States: `Not started` (opens/due dates, attempts allowed) · `In progress` (n of m answered · autosaved → Resume) · `Corrections needed` (lock icon + "Correct {n} missed questions to unlock attempt {k}" → Do corrections) · `Corrections submitted` (awaiting approval, if that mode) · `Relearning in progress` ("LT4: corrections ✓ · activity ✓ · practice 0/1") · `Retake required` (summatives: "Must retake: LT4 · 70%" plus "Optional: LT2 · 80%, LT3 · 90%" with checkboxes → Start retake) · `Retake available` (all targets ≥80%; optional only) · `Done` (highest score, "all targets proficient").
   - **Practice · always open** section below assignments: relearning activities and practice sets, each with a completion state. When a retake is pending, the items tagged to the student's required targets are grouped at the top as **"Needed before your retake"** with a 3-item checklist per target (corrections · activity · practice).
3. **Test-taking** — the calmest screen in the app. Thin header: title · Saved indicator · countdown timer · full-screen icon. Progress bar + "Question n of N" + the question's **learning-target chip**. Stem in 15px; media (image/graph/video) in a soft panel; answer options as **large tappable rows** (Chromebook/touch) with an unmistakable selected state. Flag-for-review · Previous · Next. Bottom **navigator** grid (answered / flagged / current / unanswered) — hidden when "no backtracking" is on. Subtle security footer: "Full-screen mode · leaving this tab is recorded for {teacher name}" + tab-switch count. Autosave every answer; server-side timer; autosubmit at 0:00.
4. **Submit review** — Answered / Flagged / Unanswered counts; warning listing blank questions ("blank answers count as wrong") with a direct link to the first one; Keep working / Submit test. Confirmation is required; no edits after submit.
5. **Corrections form** — header "Corrections · {test}" + "Question k of m"; target chip with the student's % on it; the missed question with **their answer marked wrong** and a short **hint** (never the answer); two required fields: *Correct answer* (text) and *Why is this correct? Explain in your own words* (min 2 sentences; a verbatim copy of the explanation is rejected client-side and flagged by the AI first-pass). Previous / Save & next, autosave on every keystroke, students may revise before final submit. Footer: locked "Retake unlocks after m corrections" with progress bar.
6. **My results** — per assignment: every attempt, highest (bold), per-target bars, corrections, and a growth line (attempt 1 → retake).

### Color & type
- Brand teal `#0E7C7B` · Action coral `#FF6B5C` (buttons use a slightly deeper `#E2553A` for contrast)
- Success `#2E9E5B` · Warning `#F4A300` · Error `#E5484D`
- Text `#1A1A1A`, muted `#5C6670`, page bg `#F7F8F9`, white cards, 8px radius
- Fonts: Inter (UI) + Lexend (headings; designed for reading proficiency)

---

## 6. Security & test integrity (honest)

A website alone **cannot** fully lock a device; true lockdown needs installed software or your district's managed-Chromebook kiosk mode. We build strong deterrents + detection and are clear about the limit.

- **Tier 1 (Phase 1):** windows, access codes, roster-only access, attempt limits, server-side time limit
- **Tier 2 (Phase 2):** pools → different questions per student, randomization, one-at-a-time/no backtrack, hide results until release, no copy/paste, full-screen + focus-loss logging
- **Tier 3 (later/optional):** managed-Chromebook kiosk integration (the real lockdown — partner with IT); IP allow-lists (soft, VPN-defeatable)

---

## 7. Tech stack

| Layer | Choice | Why (analogy) |
|---|---|---|
| Language | TypeScript | One common tongue front-to-back |
| Framework | **Next.js** (React) | Classrooms + front office in one building |
| UI | **Tailwind CSS + shadcn/ui** | Pre-cut building blocks |
| Backend | Next.js server actions / API routes | The front office enforcing rules |
| Database | **PostgreSQL via Neon** (serverless, branch per PR, scales to zero and auto-wakes — never needs a manual restore) | The records room |
| Auth | **Auth.js v5** with the Credentials provider — email + password, bcrypt-hashed (decided); Google provider can be added later | The ID-badge system |
| Data isolation | **Server-side authorization layer**: every read/write goes through a server action that checks role + ownership (`requireTeacher()`, `requireOwner()`, `requireEnrolled()`); Postgres RLS optional later as a second lock | Locks on each teacher's filing cabinet, checked at the front office |
| Storage | **Cloudflare R2** (S3-compatible, 10 GB free, no egress fees — good for video) | The AV closet |
| ORM | **Drizzle ORM** + drizzle-kit migrations | The librarian translating your requests |
| AI | Anthropic API | Question-writing assistant + corrections first-pass |
| Live updates | **Polling** (tier board + monitor refetch every 5–10 s via SWR/React Query); upgrade path: Pusher or Ably free tier for true push | The PA system — a glance every few seconds is indistinguishable in a room of 24 |
| Hosting | **Vercel** (app) + **Neon** (DB) + **R2** (files) | Building + utilities, free tiers to start |
| Email | Resend | Outgoing mail (invites, resets) |

**Auth notes:** Auth.js Credentials provider; passwords hashed with bcrypt on the server; sessions as JWT with `role` and `userId` claims. Students get email + password accounts you (or a CSV roster upload) create — no self-signup. Include a teacher-side **"reset password"** button so you don't field emails. Roles: teacher, student, (admin later). **Why not Supabase:** its free tier auto-pauses projects after 7 idle days (a school tool would go offline over summer), Jon's free slots are used by live apps, and Neon + Drizzle + Auth.js is the stack he already ships with. Switching later is possible — the schema is plain Postgres.

**Cost:** free tiers cover two teachers and their classes; expect $0–25/mo for a long time.

---

## 8. Data model (skeleton — Claude Code fleshes out)

**Identity & orgs:** `users` (role) · `organizations` · `courses` · `classes` · `enrollments`
**Standards:** `learning_targets` · `standards` (framework, code)
**Content:** `question_banks` (owner, sharing) · `questions` (type, stem, media, difficulty, bloom, explanation, version, **stimulus_id** nullable, **grading_config** JSONB for numeric mode/tolerance/unit, **template_id** nullable for generated variants) · `question_options` · `question_targets` (many-to-many) · `question_pools` · `pool_questions` · `media_assets` · **`stimuli`** (owner, kind: text|image|video|audio, content/media ref, title) · **`question_templates`** (owner, stem template, variables JSONB with ranges/steps, answer expression, unit)
**Assessments:** `assessments` (**type**: practice/formative/summative; attempt policy; review mode) · `assessment_sections` · `assessment_questions` (question OR pool ref, order, points; questions sharing a `stimulus_id` are kept contiguous and the stimulus renders once) · `practice_sets` (or assessments with type=practice)
**Delivery:** `assignments` (assessment ↔ class, window, code, time limit, attempts allowed, review mode, **retake threshold** default 80) · `attempts` (student, assignment, number, **scope**: full or list of target ids, version/question set served, status, score, started/finished) · `responses` (attempt ↔ question, answer, auto score, manual score, flags) · `attempt_target_scores` (attempt ↔ learning target: points earned / possible, percent) · `assignment_final_scores` (student ↔ assignment: per-target best + combined total, recomputed after each attempt)

`assessment_sections` carries a `learning_target_id` so each summative section maps to exactly one target; a retake attempt has `scope` = the below-threshold targets and serves only those sections' pools.
**Learning cycle:** `corrections` (attempt, question, student's correct answer, explanation, status: submitted/approved/returned, AI flag, reviewer) · `relearning_activities` (owner, kind: video|reading|link|guided_notes, content/media/url, prompts JSONB) · `activity_targets` (activity ↔ learning target) · `activity_completions` (student, activity, completed_at, evidence JSONB e.g. watch %, teacher_verified) · `practice_sets` (owner, questions or pool ref) · `practice_set_targets` · `practice_attempts` (student, set, answers, score, completed_at) · `retake_gates` (student ↔ assignment ↔ target: corrections_ok, activity_ok, practice_ok, unlocked_at — recomputed by a server function after every relevant event) · **`worksheets`** (script_id unique, title, student_url, course, counts_as: practice|activity|both, section_target_map JSONB) · **`worksheet_events`** (worksheet, student, event: submit|progress, score, section_scores JSONB, cards_correct, total_checks, received_at) · `assignment_pins` (assignment ↔ target ↔ pinned activity/set, optional)
**Sharing:** `shares` (bank/assessment ↔ user, permission)

Key idea, again: **questions are independent records; assessments point at them.** Attempts store the exact question set served so retakes and analytics are reproducible.

---

## 9. Phased roadmap (revised)

**Phase 0 — Foundation (1–2 weekends)** — *complete locally, Sept 21, 2026 (Tickets 0.1–0.9, 0.11; Vercel deploy in 0.10 pending Neon + Vercel credentials)*
Repo, Next.js + Tailwind + shadcn scaffold, Neon project + Drizzle schema/migrations, server-side authorization layer with tests, Auth.js email/password for teacher + student, design tokens, dashboard shell.
*Outcome:* both teachers can log in; a student account can be created.

**Phase 1 — Working builder + students take tests (the goal)**
- Courses/units/banks; learning-target tagging
- Author MC, T/F, short answer, fill-in-blank, multiple select, numeric (all grading modes + units), with images
- **Shared stimulus** objects in the builder and test view
- **Import:** CSV/text bulk (anatomy banks) + Word/PDF AI-assisted parser (biology tests)
- **Question pools** tagged to targets
- Assessment builder with **type + attempt policy**
- Assign to class with window/code/time limit
- Student login → assignments → take test → autosave → auto-grade
- **Learning cycle:** corrections form, review gate (auto or teacher-approved), formative retakes (3), summative retake from pool, **highest counts**
- Gradebook with attempts + highest; CSV export for Skyward
- **Practice sets + relearning activities** (video, reading, external link, **Apps Script worksheet via webhook**) with completion tracking — they're retake gates, so they're Phase 1
- **Live tier board** + **relearning monitor** for summatives (polling)
- Shared Physical Science bank for you + colleague
*Outcome:* real quizzes and tests with real classes, with corrections and retakes working.

**Phase 2 — Bigger and better**
- Guided-notes activity type; teacher-verified link completions; activity sequencing
- **Sync worksheets from the Worksheet Index** (Google OAuth)
- AI generation + distractors + explanations; AI first-pass on corrections
- **Dynamic numeric variant generator** (templates → N questions into a pool)
- **Google Classroom roster import**
- Matching, ordering, numeric, image-hotspot, video questions
- Tier 2 security; randomization/versions everywhere
- Analytics: mastery, item/distractor analysis, **growth view**
- Manual grading queue with rubrics; accommodations

**Phase 3 — Scale**
- More colleagues/department library, richer permissions
- Live monitoring; dark mode; kiosk-mode integration; optional Skyward integration if the district approves

---

## 10. Decisions log

| Decision | Choice |
|---|---|
| Name = | **Bloom** (final) |
| Corrections = | Write correct answer + explain why |
| Summative retake = | **Targeted:** targets below 80% are **required**; targets ≥80% are **optional** (student opts in, on by default); new questions from each selected target's pool, same question count as the original section |
| Relearning monitor = | Per-student view of the three gates + time on task per target with a readiness summary; class table sortable by readiness (Phase 1, alongside the tier board) |
| Worksheets = | Existing Apps Script worksheets count as practice sets (or activities) via a signed webhook on final submit; student Bloom email = Cadott Google email; section titles carry LT labels so one worksheet can satisfy several targets |
| Retake gates = | Per required (or opted-in) target: corrections approved + ≥1 relearning activity completed + ≥1 practice set completed (completion, not score). Any tagged item counts by default; teacher may pin specific ones per assignment |
| Retake threshold = | 80% per learning target (configurable per assignment) |
| Grade after retake = | Highest counts — per target for summatives (max per target, then summed); per attempt for formatives |
| Summative structure = | One section per learning target, each with its own pool |
| Tier board = | Tier 1: 0 targets < 80% · Tier 2: 1–2 · Tier 3: 3+ (boundaries configurable); live via polling, push later if wanted |
| Competitor review (Sept 15, 2026) — approved additions | **Shared stimulus** (Phase 1) · **Numeric grading modes + units** (Phase 1) · **Dynamic numeric variants** (Phase 2) · **Google Classroom roster import** (Phase 2) |

**Parked — reviewed, NOT approved (do not build unless Jon says so):** categorize/bucket questions · show-your-work drawing · audio response · file-upload response · word bank for fill-in-blank · build-a-test-from-existing-tests · AI rubric scoring of written responses · time-per-question analytics · per-distractor feedback · teacher-pace mode · certificates · email reminders · student self-registration.
| Student login = | Email + password (Auth.js Credentials + bcrypt); Google later if wanted |
| Infrastructure = | **Neon + Drizzle + Auth.js + Cloudflare R2 + Vercel** (decided Sept 21, 2026; replaces Supabase — free-tier auto-pause and slot limits) |
| Practice source = | Curated sets you build and publish |
| Sharing at launch = | You + one physical science colleague, shared bank |
| Skyward = | Track highest + CSV export; no direct integration in v1 |
| Formative attempts = | Default 3, configurable per assignment |
| Corrections review = | Per-assignment: auto-unlock or teacher-approved (AI first-pass) |

**Still open (defaults assumed):** standards framework (assume your own learning targets + NGSS codes optional); score threshold that *requires* corrections vs. makes them optional (assume: corrections required for any retake, optional otherwise).

---

## 11. First commands for Claude Code

```
npm install -g @anthropic-ai/claude-code    # Node 18+
cd bloom
claude
```
Then: *"Read PLAN.md. Scaffold Phase 0: Next.js + TypeScript + Tailwind + shadcn/ui, Neon + Drizzle, Auth.js email/password with teacher and student roles, the server-side authorization layer from §7, and the dashboard shell using the color tokens in §5. Then stop and show me the schema before building Phase 1."*

Keep PLAN.md in the repo root and update the decisions log as you go — it's Claude Code's source of truth.

---

## Appendix A — CSV bulk import contract

Template: `question_import_template.csv` (also `question_import_template.xlsx` with dropdowns + an Instructions sheet). One question per row. Claude Code's importer must accept exactly this format.

**Columns (in order):**
`external_id, course, unit, topic, learning_target, standard, pool, type, stem, stimulus_ref, stimulus_text, stimulus_image_url, stimulus_video_url, option_a, option_b, option_c, option_d, option_e, option_f, correct, tolerance, tolerance_mode, unit, points, difficulty, bloom, grading, explanation, image_url, video_url, tags`

**Required:** `course, unit, learning_target, type, stem`, and `correct` (except `matching`, `extended_response`). Missing required → row rejected with a clear error; import continues for other rows and shows a summary.

**`type` values:** `multiple_choice | multiple_select | true_false | fill_blank | short_answer | extended_response | numeric | matching | ordering`

**`correct` conventions by type:**
| type | correct |
|---|---|
| multiple_choice | one letter: `c` |
| multiple_select | letters, comma-separated: `a,c,d` |
| true_false | `true` / `false` (options blank) |
| fill_blank | accepted answers `\|`-separated, case-insensitive: `erythrocytes\|erythrocyte`; stem contains `___` |
| short_answer | optional keyword hints `\|`-separated; `grading` should be `manual` |
| extended_response | blank; `grading` = `manual` |
| numeric | the number; `tolerance_mode` = `exact` (default) · `abs` (± `tolerance`) · `percent` (`tolerance` = %) · `range` (`correct` = `min-max`); `unit` optional — when set, answers with or without that unit both match |
| ordering | option letters in correct sequence: `c,a,b,d` |
| matching | blank; each option cell is `left :: right` (pairs split on ` :: `) |

**Other rules**
- `external_id` present + already in the bank → **update** that question (new version), else insert. Absent → always insert.
- `learning_target` and `pool` are matched by name (case-insensitive, trimmed) within the course; auto-create if missing and report "created N new targets/pools."
- `points` default 1; `difficulty` 1–5 default 3; `bloom` ∈ remember/understand/apply/analyze/evaluate/create; `grading` default `auto` (forced `manual` for extended_response).
- `image_url` / `video_url`: absolute URL → stored as link; relative filename → expect a matching file in the accompanying upload (zip or multi-file) → stored in Cloudflare R2. YouTube URLs allowed for video.
- `tags` comma-separated, trimmed, deduped.
- **Shared stimulus via CSV:** rows with the same `stimulus_ref` (e.g. `tomato-graph`) share one stimulus. Put `stimulus_text` / `stimulus_image_url` / `stimulus_video_url` on the *first* row with that ref; later rows may leave them blank. The importer creates one `stimuli` record per ref (or matches an existing one by ref within the course) and keeps the group contiguous.
- Encoding UTF-8; standard CSV quoting (commas inside quoted cells are fine).
- Importer shows a **preview table** with per-row status (ok / warning / error) and lets the user fix or skip before committing. Nothing is written until confirm.

---

## Appendix B — Bloom webhook block for `Code.gs`

Add this to the CONFIG area of every worksheet (new ones by default; old ones on their next **New version** redeploy). Answers and hints stay in `Code.gs` as before; this only *sends results out*.

```javascript
// ---- Bloom integration (leave URL blank to disable) ----
const BLOOM_WEBHOOK_URL = '';   // e.g. https://<your-bloom-domain>/api/integrations/worksheet
const BLOOM_SECRET      = '';   // same value as BLOOM_WORKSHEET_SECRET in Bloom's env

function bloomNotify_(payload) {
  if (!BLOOM_WEBHOOK_URL) return;
  try {
    UrlFetchApp.fetch(BLOOM_WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: { 'X-Bloom-Secret': BLOOM_SECRET },
      payload: JSON.stringify(Object.assign({
        scriptId:  ScriptApp.getScriptId(),
        worksheet: PAGE_TITLE,
        email:     Session.getActiveUser().getEmail(),
        at:        new Date().toISOString()
      }, payload))
    });
  } catch (e) { /* never block the student */ }
}
// At the end of the final-submit handler:
//   bloomNotify_({ event: 'submit', score: pct, sectionScores: sectionPct, cardsCorrect: nCorrect, totalCards: nCards, totalChecks: nChecks });
// Optionally after each autosave:
//   bloomNotify_({ event: 'progress', cardsCorrect: nCorrect, totalCards: nCards });
```

**Bloom side (Phase 1):** `POST /api/integrations/worksheet` verifies `X-Bloom-Secret`, upserts `worksheets` by `scriptId` (creating an *unregistered* entry Jon can finish tagging in the UI), inserts a `worksheet_events` row, matches `email` to a student, and calls the gate-recompute function. Unknown emails are stored and shown in a "unmatched submissions" list rather than dropped. Idempotent on (scriptId, email, at).
