# Bloom — Assessment Platform Build Plan & Spec (v2)

*Author: Jonathan Erickson · Audience: you + Claude Code · Updated: Nov 4, 2026*
*Name **Bloom** is final: Bloom's taxonomy (the `bloom` tag on every question) + students growing through the relearning cycle. Register the domain you'll use (a `.app` or `.school` is fine — expect `bloom.<something>`, not `bloom.com`).*
*v2.1 (Sept 21, 2026): infrastructure switched to **Neon + Drizzle + Auth.js + R2** (see §7). v2 changes: added the learning cycle (formative/summative attempts + corrections + retakes), **targeted summative retakes by learning target (80% threshold)**, **live tier board**, practice sets, student auth decision, import moved to Phase 1, two-teacher sharing at launch.*
*v2.2 (Nov 4, 2026): **relearning revamp** approved (`docs/relearning-revamp-plan.md`). A shorter path to the retake: corrections → one relearning activity the student picks (**Read · Watch · Do**) → a **5-question practice check (4/5)**, shown to students as a **step path**. Quiz scores are raised **per learning target**, every score shows its history, and the Skyward export is a percent per Skyward assignment. It takes effect at launch (ticket L1) for Physical Science and Biology together; assignments taken before launch keep the v2 rules, and Anatomy keeps its CVTC rules.*

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
| One-and-done testing | **Attempt → corrections → relearn → practice check → retake** learning cycle |
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
| **Formative** (quiz) | Default 3 (configurable) | Per learning target below 80%: **corrections → relearning (Read · Watch · Do, about 10 min) → 5-question practice check (4/5)**. Finishing raises that target to 80%, and the retake is then optional. Targets at/above 80%: corrections → 90%, the same path → 100% (§4) | **Highest per target** | "Assignments" when open |
| **Summative** (test) | 1 + 1 retake (configurable) | Per target below 80% (**required**, "Must retake"): **corrections → relearning (about 10–15 min) → 5-question practice check (4/5)**, then a **targeted retake**: the full test, or a custom test of chosen targets, with new questions from each target's pool. Targets **at/above 80% are optional** ("Retake available") and need corrections only (§4) | **Highest per target**, combined | "Assignments" when open |

*The gates above apply from the relearning launch (Nov 2026, ticket L1; `docs/relearning-revamp-plan.md`). Assignments taken before it keep the v2 gates: a summative's corrections approved → one relearning activity → one practice set (completion), and a formative's corrections cap plus 80% quiz practice (§4, "Before the relearning launch").*

**Formative retake:** same assessment, same number of questions; may be re-randomized (order/answers) but same question set unless you attach a pool. The highest score counts per target. A third attempt needs a fresh 4/5 practice check on any target still below 80% on the retake (§4).
**Summative retake (targeted):** a summative is built as **one section per learning target**, each backed by its own pool. After attempt 1, the platform scores each target separately. Any target below the **80% threshold** (configurable) is labeled **Must retake** — the platform assigns it automatically, no teacher action needed. Targets at or above 80% are labeled **Retake available**: the student may opt in to any of them to raise the score (after correcting that target's missed questions), or pick **Full test** to retake every target. The retake serves a fresh set of questions for *only the selected targets*, the same number as the original section. Example: 10/10 on LT1–LT3 and 7/10 on LT4 → LT4 is required; the student may also choose LT1–LT3 but doesn't have to.

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

### 3.7 Practice sets, practice checks and relearning activities
Published content lives in the student's **Practice** tab, all of it tagged to learning targets. *The practice check and the Read · Watch · Do activities are the relearning revamp (approved Nov 4, 2026; `docs/relearning-revamp-plan.md`, rules P1–P5 and A1–A6). They take effect at launch (ticket L1).*

**Practice sets** (questions; "Study practice" from the relearning launch)
- You build and **publish** curated sets per target/topic from the bank (or a pool)
- Always visible to enrolled students; unlimited attempts; not graded
- **Checking, Apps Script style** (Oct 13, 2026): a wrong check says "not quite" and the student tries again (no key shown); the question's **hint** shows after the **3rd miss**; **Show answer** reveals the key + explanation any time and closes the question as not correct. A right check closes it with the explanation.
- A set can **deal from a bank or pool** (a fresh hand each attempt, unseen questions first), balanced **3 easy : 4 medium : 3 hard** and served easy → hard.
- **Completion** = every question in the set closed (right, or its answer shown). Best % counts only questions right before a reveal, and is tracked for you and shown to the student.
- From the relearning launch, practice sets **no longer count toward a retake**. They stay in the Practice tab as **Study practice** for studying and test prep. Before launch they are a retake gate (§3.7a, §4).

**Practice check** (the retake gate, from the relearning launch)
- 5 auto-graded questions from the target's **Practice bank(s)** only (never Quiz, Test or Retake banks). Each check has 3 easy · 1 medium · 1 hard, at most one true/false and never a short answer, with unseen questions first.
- The first answer counts. Each answer shows right/wrong and the explanation; there are no hints or retries inside the check.
- **4/5 passes** (a per-assignment setting, default 4). Below that, a **Look back** screen shows the missed questions with explanations and a link back to the relearning, then **Try a new 5**. Rounds are unlimited.
- A quiz's check covers every target on its path (5 split across them, the extra going to the weakest). A test runs one check per required target.
- Practice banks grow to about **100 questions per learning target** for Physical Science and Biology.

**Relearning activities** (learning, not testing)
- **From the relearning launch,** each target has up to three modes, and the student picks one: **Read** (a short reading with an analogy, worked examples and quick checks), **Watch** (a video, YouTube in Restricted Mode or Jon's own upload, paused at set timestamps for quick checks), or **Do** (drag-and-drop labeling/sorting/matching, a flashcard set, or step-by-step worked problems).
- Each mode has a **core** (about 3–5 min) and an **extension** (about 5–10 min). A quiz on 2+ targets stitches the cores into one activity (about 10 min). Single-target quizzes and tests use core + extension (about 10–15 min per target).
- **Completion:** every quick check answered right (unlimited tries), plus at most one short answer where it fits; Read scrolled to the end; Watch ≥90% of each segment. The student can switch modes until they finish one. A video that won't play offers Read or Do and is flagged for Jon.
- **Before the launch** (and still for assignments taken before it), an activity is a teacher-published item tagged to a target, one of: **video** (YouTube or upload), **reading** (rich text page you write or paste), **worksheet** (one of Jon's Apps Script interactive worksheets — see §3.7a), **external link** (a Google Doc, Slides, EdPuzzle, etc.), or **guided notes** (a page with 2–5 short-response prompts).
- **Completion** rules for those kinds: video → watched to ≥90% (player events) · reading → scrolled to end + "I finished" · **worksheet → final submit received from the worksheet itself (verified, no honor system)** · external link → opened + "I finished" (optionally teacher-verified) · guided notes → all prompts answered.
- Activities are reusable across assessments and can be sequenced ("watch this, then do these notes").

### 3.7a Apps Script worksheet integration
Jon's interactive worksheets (Apps Script web apps: per-problem Check with unlimited tries, hint after 3 misses, autosave by Cadott Google login, a response Sheet, and a row in the **Worksheet Index**) become first-class Bloom content without rebuilding them.

**How a worksheet talks to Bloom (push, real-time):** a small optional block in each worksheet's `Code.gs` (Appendix B) POSTs to Bloom's `/api/integrations/worksheet` endpoint on every **final submit** (and optionally on each autosave) with: the script ID, worksheet title, the student's Cadott email, score, per-section scores, and a timestamp, signed with a shared secret. Bloom matches the email to the student account and the script ID to the registered worksheet, records a completion, and recomputes retake gates — the tier board updates live.

**Identity rule this depends on:** every student's Bloom account email **must be their Cadott Google email** (the roster CSV / Google Classroom import both provide it). Login remains email + password.

**Registering a worksheet in Bloom** (Phase 1, manual): paste the student link (or script ID) → title auto-filled on first webhook → choose **counts as:** practice set · relearning activity · both (default: practice set, because worksheets are problem sets) → tag learning target(s). If the worksheet's section titles carry LT labels (the Physical Science convention), Bloom offers a **section → target map** so one multi-part worksheet can satisfy the gate for each target separately (a student who finished Part D: LT4 gets LT4 credit even if Part A is blank).
**Phase 2:** "Sync from Worksheet Index" — Bloom reads the Index sheet via the same Google OAuth used for Classroom rostering and registers new worksheets automatically; old worksheets just need a **New version** redeploy after the webhook block is added.

**Completion = final submit received** (any score), matching the completion-not-score rule. A per-assignment option can require ≥N% on the worksheet if Jon ever wants it. Bloom also stores cards-correct and total checks from the payload so the relearning monitor can show "worksheet: 12/15 correct, 41 checks, hint used on 3."

**Going forward (Oct 13, 2026): new practice is built in Bloom, not Apps Script** — per-target banks dealt by practice sets with Apps Script–style checking (§3.7), so there is nothing to deploy and register. Worksheets already registered keep working through the webhook. See `docs/ps-practice-banks-plan.md`.

**As retake gates (before the relearning launch, and for assignments taken before it):** for each *required* target, the student must complete **at least one relearning activity and at least one practice set** tagged to that target (any of them by default; you can pin specific ones per assignment). Optional targets the student opts into follow the same gates. This is why "Suggested before your retake" appears on the student home — the platform shows exactly which items would satisfy the gate.
**From the launch,** worksheets no longer count toward a retake. The gate becomes the Read · Watch · Do relearning plus the practice check (§3.7), and the student's step path (§5) replaces "Suggested before your retake." Registered worksheets stay in the Practice tab for study.

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
- Gradebook per assignment: student, attempts, each score, **highest (bold)**, corrections status, finished time. Each score shows its **history trail**, e.g. **40 → 80 (path) → 95 (retake)**, with every step dated (relearning revamp, G1).
- Per-student review: answer vs. correct, plus their corrections
- **Skyward:** no direct integration in v1. The platform tracks the counting score and exports **one CSV per Skyward assignment** in Skyward's import format (relearning revamp, K1–K2; Jon, Nov 3–4 2026):
  - The header row is `Last Name,First Name,ID,Score`, and Score is a **percent** (whole number, rounded half up).
  - Quizzes export **one file per learning target**, because Jon enters formatives per target (e.g. `F_LT3U2`). Tests export **one overall file** (e.g. `S_LT1,2,3,4U2`). Several files download as one .zip, with single-file buttons too.
  - **ID** is the student's lunch code: the digits before the @ in their Cadott email. Students without one are listed so the account can be fixed first.
  - The older detailed CSV stays as "Detailed CSV."
  - (A real Skyward integration needs district admin approval — revisit later.)

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
- Each student card shows: initials/name, the targets below threshold (**required**, coral) and any optional targets the student opted into (**optional**, gray) with their %, and their **relearning stage**: `attempt 1 done → corrections not started → corrections in progress (n of m) → corrections submitted (awaiting approval, if that mode) → retake ready → retake in progress → retake done`. From the relearning launch, two stages sit between corrections and retake ready: `relearning (Read / Watch / Do, n of m checks) → practice check (round n, best k/5)`.
- Tier is recomputed from **per-target best scores** after every event (submission, correction, approval, retake), so a student moves columns the moment a retake lifts a target over the line. Cards that moved up get a "moved up today" marker.
- Header stats: students per tier, retake window status, threshold. Footer: "N students moved up a tier this week," and the **most-missed target** (the one to reteach).
- Click a card → the **Relearning monitor** for that student (below). Click a target chip → item analysis for that target.
- **Relearning monitor (per student):** one screen showing everything they've done since attempt 1, per target: attempt-1 score; corrections (n of m submitted / approved / returned, with a link to read them); **practice activity on that target** (which practice sets tried, attempts, best %, last active); time on task; and retake status. A **readiness** line summarizes the three gates — e.g. "LT4: corrections ✓ · activity ✓ (watched blood-flow video) · practice ✓ (best 85%) · **retake unlocked**" or "LT4: corrections returned · activity not started · practice 0/1" — so you can see at a glance who is actually relearning versus who is waiting to guess again. From the relearning launch the line follows the path: "LT4: corrections ✓ · relearning ✓ (Watch) · practice check ✓ (4/5, round 2) · **retake unlocked**." Same data feeds a class-level table (one row per student, one column per target) sortable by readiness, so you can call up the not-ready students first.
- Practice sets tagged to a student's required targets are auto-suggested on their home screen ("Suggested before your retake") and their activity flows back into the monitor. From the relearning launch, the student's step path names the exact next step instead, and study practice stays in the Practice tab.
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

This is the workflow Claude Code must implement exactly. *Relearning revamp, approved Nov 4, 2026. The full rules (Q1–Q8, S1–S6, P1–P5, A1–A6) are in `docs/relearning-revamp-plan.md`. They apply to Physical Science and Biology assignments whose attempt 1 finishes on or after the course's `relearning_path_from` date, set at launch (ticket L1). Earlier assignments follow "Before the relearning launch" below, and Anatomy keeps its CVTC rules (decisions.md, "CVTC rules").*

**Corrections requirement (decided, unchanged):** for each missed question the student must **(a) write the correct answer and (b) explain in their own words why it's correct / why their answer was wrong.**

**The path** (one per assessment, with one line per required target on a test), shown to the student as a **step path** (§5):
1. Student submits attempt 1 → auto-grade → score shown (or withheld until you release). Each learning target is scored on its own.
2. **Corrections** on the missed questions of every target on the path (form unchanged).
3. **Relearn:** the student picks **Read, Watch or Do** (§3.7). It opens when corrections are **submitted**, in teacher-approved mode too.
4. **Practice check:** 5 questions, the first answer counts, **4/5 passes**. Below that: Look back, then a fresh 5.
5. **What the finished path earns:**
   - **Formative, target below 80% (required):** the target is raised to **80%** automatically (in teacher-approved mode, once Jon approves the corrections). The student then chooses **Keep my 80%** (done for now; the retake stays available until the window closes) or **Take the retake**.
   - **Formative, target at/above 80% (optional):** corrections alone → **90%** (or the attempt-1 score if higher). Ticking **Add** puts the target on the path, and finishing it → **100%**. No retake.
   - **Summative:** no score change. The **retake unlocks** once every required target has passed its check (and its corrections are approved, in that mode).
6. **Review gate** (corrections), chosen per assignment:
   - *Auto:* corrections are approved when they're submitted.
   - *Teacher-approved:* you approve, with an AI first-pass flagging thin explanations. Relearning and the check go ahead meanwhile. The raised quiz score and the retake wait for your approval, and corrections sent back are fixed without redoing the relearning or the check.
7. **Retake:**
   - **Formative:** the whole quiz, same number of questions. The retake's score stands on its own (no correction credit). It's allowed up to the attempt limit (default 3), starting within the retake window (7 days from attempt 1). Attempt 3 needs a fresh 4/5 check on any target still below 80% on the retake; if none are below, no check is needed.
   - **Summative (targeted):** **Full test** or **Custom**. Required targets are locked in. Targets at/above 80% are optional and need corrections on their missed questions first, nothing more. The retake serves **new questions from each selected target's pool**, matching the original section size. One retake by default.
8. **Highest score counts per target**, for quizzes and tests. A test's targets are summed into one test score, while a quiz's targets go to Skyward one column each. All attempts, corrections, relearning and practice rounds are kept for the growth view and the score trail.

**Worked example (summative, 4 targets × 10 pts):**
Attempt 1 → LT1 10, LT2 10, LT3 10, LT4 7 = 37/40 (92.5%). LT4 is 70% → below 80% → corrections on the 3 missed LT4 items → relearning on LT4 (picks Watch, about 12 min) → practice check 4/5 → retake = 10 new LT4 questions → scores 9. Final = 10+10+10+**9** = 39/40.

**Worked example (formative, one target):** attempt 1 = 40% → corrections → Read (about 10 min) → practice check 3/5 → Look back → a new 5, scored 5/5 → **80%** automatically → the student retakes → 95%. Final = **95%** (trail: 40 → 80 → 95).

**Rules**
- Corrections are required on the *missed* items of every target on the path, and of any optional target the student adds to a test retake or ticks for 100% on a quiz.
- **Nothing on the path can be skipped.** The retake button stays locked until every required target has passed its practice check.
- Corrections, relearning and the practice check **stay open after an assessment closes**, with no deadline. A finished path on a closed assessment shows **Ask to retake**, and Jon's Approve reopens it for that student until the end of the next school day.
- A target can never score lower after a retake (highest per target).
- On a test there is **no partial credit** along the way: the path unlocks the retake, and the retake earns the score.
- Threshold (80%), attempt limits, review mode and the practice check's pass mark (4 of 5) are set per assignment (defaults per type). Optional retakes for targets ≥80% are **on by default** (can be disabled per assignment).
- If **every** target is ≥80%, nothing is required. On a quiz: corrections → 90%, and the path → 100%, with no retake. On a test, the student may still opt into a retake on any target after correcting its missed questions.
- The results page and the Skyward export carry the counting score and how it came about.

**Before the relearning launch** (and still for assignments whose attempt 1 finished before it):
- **Summatives:** three gates per required or opted-in target: corrections (approved, if that mode is on) + one completed relearning activity + one completed practice set, in any order. Practice is completion-based, not score-based.
- **Formatives: corrections cap** (Jon and colleague, Oct 8 2026, on by default per assignment). Attempt 1 below the threshold → *Must do corrections*; finishing them lifts the score to the threshold and no higher. Attempt 1 at or above it → corrections optional; finishing them lifts the score to 100%.
- **Before a quiz retake** (or asking for one), each target below the threshold needs a finished practice scored 80%+ on that target's questions (docs/student-home-plan.md, R3).
- A retake's score stands on its own (no correction credit), and the highest attempt counts, up to the attempt limit (3) within the retake window (7 days from attempt 1). Corrections stay open after the window.

---

## 5. Screens (UX)

Layout: **teal left sidebar** (Dashboard · Question banks · Assessments · Practice sets · Assign · Results · Classes · Shared · Settings), top bar with global search + course/term switcher, main content area. Mobile/Chromebook-friendly; the student view especially.

**Teacher screens**
1. Dashboard (rebuilt Oct 13 2026, docs/dashboard-plan.md) — **Needs you**: everything waiting on you across all courses (asked to finish, retake requests, corrections to check, answers to grade, activities to check off, worksheet emails); a closed test's retake request reads "Closed · Approve reopens it for {first name} through {date}" and says what would still block it (corrections, quiz practice owed, a summative's checklist). Below it the **class gradebook** for one period: students × tests, one status tag per cell from the same rule as the student's card; a cell opens a plain sentence and its actions, a name opens the student's own to-do for that class (the same list their home shows, Oct 14 2026). Recent activity last. From the relearning launch, Needs you also lists **Video won't play** flags, showing the video and how many students hit it (`docs/relearning-revamp-plan.md`, A6).
2. Question banks — tree + filterable list, edit panel slides in
3. Assessment builder — bank on left, test on right, drag across; type + attempt policy settings; blueprint & AI buttons
4. Practice sets — build/publish. From the relearning revamp, also **Relearning activities** (a Read / Watch / Do builder per target, each mode with a core and an extension) and **Practice bank health** (count by difficulty and type, flagged when a band can't fill a check)
5. Assign — test → class → window/code/time/attempts (plus the practice check's pass mark, default 4 of 5)
6. Results — gradebook with attempts + highest and each score's history trail; per-student review incl. corrections; **Skyward export** (one file per Skyward assignment, §3.9)
6a. **Corrections approval queue** — for assignments in teacher-approved mode: one card per submitted correction set (student, test, targets, AI first-pass flag), expand to read each correction, approve all / send back with a note; keyboard-fast (A approve, R return). Approving unlocks the retake instantly and updates the tier board. (From the relearning launch, approving raises a finished quiz path to 80%, and the retake unlocks once the path is done.)
6b. **Tier board** — live three-column board (Tier 1 / 2 / 3) per summative; see §3.11
7. Analytics — mastery, item/distractor analysis, growth
8. Classes — rosters, add students, **reset a student's password**

**Student screens** (designed — mockups reviewed Sept 2026)
1. **Login** — email + password; "forgot password" routes to teacher reset, not email.
2. **Home** — a to-do list (rebuilt Oct 14 2026; docs/student-home-plan.md, Jon: "Even having those as items to do or a to-do list to help them would be great"). Header: "Hi, {first name}" + "You have {n} things to do." (or "You're all caught up."), where n is exactly the rows under To do. Top to bottom:
   - **From the relearning launch** (`docs/relearning-revamp-plan.md`): an assessment's corrections, relearning, practice and retake rows become **one row with a mini step path** (screen 7) and the one next-step button. The card's status pill shows the same mini path, and "Relearning in progress" covers the relearning and the practice check. The rows below describe today's list and still apply to assignments taken before launch.
   - **To do** (always shown, above the tabs; a list, not an "Up next" card), in this order: keep going on an open attempt (a paused test says "Paused. Finish it in class."); corrections sent back, with the teacher's note; corrections, open or closed ("Correct 3 missed questions to raise your score from 40% to 80%." · "0 of 3 done" → Do corrections); quiz practice, one row per missed learning target ("Practice U2.LT1: score 80% to unlock your retake (you scored 40%)." · best so far → Build my practice on that target); a summative's relearning checklist (per target: corrections ✓ · activity ✗ · practice ✗); a required retake (Start retake, or "You can start after …" with no button during the wait); **Ask to retake** on a closed test when the retake would be required; open tests not started ("Closes …" · minutes · code from your teacher → Start). Inside a kind, soonest deadline first (a reopen counts), then no deadline, then most recently closed.
   - **Want a higher score?** (not counted): optional retakes, Ask for a retake (tests with "Retakes need my OK"), an optional Ask to retake on a closed test, and the steps before an optional ask.
   - **Waiting on your teacher** (not counted; collapsed on a phone): waiting for your grade, corrections being checked, a retake request, an activity waiting for its check-off.
   - Tabs (in the address as `?tab=`, so Back works and a row can open one): **Assessments**, grouped Open now · Opens soon · Closed (collapsed: "Show closed · n · k have corrections to do"); **Practice** ("Needed before your retake" for tests open to the student, a quiz's missed targets included, then always-open practice by unit and Build my practice); **My results**.
   - Class chips and "Join a class" last. Phone: rows stack with full-width 44px buttons, no sideways scroll at 320px.
   - Each assessment card keeps a **status pill** and **one action button**; the pair changes together. States: `Opens soon` · `Not started` · `In progress` (n of m answered → Continue; paused → Finish in class) · `Waiting for your grade` · `Corrections needed` (open or closed: corrections stay open after a test closes) · `Do corrections → 100%` · `Corrections returned` · `Corrections submitted` · `Relearning in progress` (a summative's checklist, or a quiz's practice on every missed target: 80% on practice) · `Retake required` (summatives: required targets plus optional ones to tick → Start retake) · `Retake available` · `Waiting for teacher` ("Retakes need my OK", or a retake request) · `Ask to retake` (a closed test whose retake is otherwise ready; the teacher's Approve reopens it for that student until the end of the next school day) · `Closed` · `Done for now`.
3. **Test-taking** — the calmest screen in the app. Thin header: title · Saved indicator · countdown timer · full-screen icon. Progress bar + "Question n of N" + the question's **learning-target chip**. Stem in 15px; media (image/graph/video) in a soft panel; answer options as **large tappable rows** (Chromebook/touch) with an unmistakable selected state. Flag-for-review · Previous · Next. Bottom **navigator** grid (answered / flagged / current / unanswered) — hidden when "no backtracking" is on. Subtle security footer: "Full-screen mode · leaving this tab is recorded for {teacher name}" + tab-switch count. Autosave every answer; server-side timer; autosubmit at 0:00.
4. **Submit review** — Answered / Flagged / Unanswered counts; warning listing blank questions ("blank answers count as wrong") with a direct link to the first one; Keep working / Submit test. Confirmation is required; no edits after submit.
5. **Corrections form** — header "Corrections · {test}" + "Question k of m"; target chip with the student's % on it; the missed question with **their answer marked wrong** and a short **hint** (never the answer); two required fields: *Correct answer* (text) and *Why is this correct? Explain in your own words* (min 2 sentences; a verbatim copy of the explanation is rejected client-side and flagged by the AI first-pass). Previous / Save & next, autosave on every keystroke, students may revise before final submit. Footer: locked "Retake unlocks after m corrections" with progress bar ("Relearning opens after m corrections" from the relearning launch).
6. **My results** — per assignment: every attempt, highest (bold), per-target bars, corrections, and a growth line (attempt 1 → retake), with the score trail (e.g. 40 → 80 → 95).

*Screens 7–9 are the relearning revamp (approved Nov 4, 2026; `docs/relearning-revamp-plan.md`, ticket R5). They take effect at launch.*

7. **Step path** — connected circles, subway-map style: Corrections · Relearn · Practice · 80% earned (or 100%) · Retake.
   - A done step shows a green check and its date. The current step is teal and larger, with a pulsing ring. A locked step is gray with a lock and a one-line reason ("Opens after your corrections").
   - Under the path is one **Next step** box: a headline, "About N minutes" and **one button**.
   - Tests stack one line per required target, with "Retake unlocks when every line is ✓." A quiz shows per-target lines only when more than one target has work to do. Optional quiz targets get a tick box: "Add LT2 (90%) to reach 100%. Adds about 3–5 minutes."
   - In teacher-approved mode, the corrections circle reads "Turned in, waiting for your teacher's OK," and the Next step box keeps the student moving: "Start your relearning while you wait."
   - A quiz path ends with two big choices: **Keep my 80%** or **Take the retake**.
   - It appears as a mini path on the home row and the card, and as the full path on the assessment page. On a phone it's a vertical list with the Next step box first. It uses the same rule as the teacher gradebook, so they always agree.
8. **Relearn picker + activity** — three big cards, **Read 📖 · Watch 🎬 · Do 🧩**, each with a one-line description and "About N min." Inside the activity, quick checks sit inline with unlimited tries. Watch pauses at each check, and a video that won't play offers Read or Do instead.
9. **Practice check** — "Question k of 5," one answer each, then right/wrong plus the explanation. The result screen reads, e.g., "4 of 5. Your retake is unlocked" (or "Your 80% is in"). Below 4/5, **Look back** shows the missed questions with explanations and "Reopen my relearning," then **Try a new 5**.

### Color & type
- Brand teal `#0E7C7B` · Action coral `#FF6B5C` (buttons use a deeper `#CC4429`: white text on it passes AA contrast at 4.7:1; `#E2553A` was 3.75:1, changed Nov 9 2026)
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
**Content:** `question_banks` (owner, sharing) · `questions` (type, stem, media, difficulty, bloom, explanation, **hint** (practice, after 3 misses), version, **stimulus_id** nullable, **grading_config** JSONB for numeric mode/tolerance/unit, **template_id** nullable for generated variants) · `question_options` · `question_targets` (many-to-many) · `question_pools` · `pool_questions` · `media_assets` · **`stimuli`** (owner, kind: text|image|video|audio, content/media ref, title) · **`question_templates`** (owner, stem template, variables JSONB with ranges/steps, answer expression, unit)
**Assessments:** `assessments` (**type**: practice/formative/summative; attempt policy; review mode) · `assessment_sections` · `assessment_questions` (question OR pool ref, order, points; questions sharing a `stimulus_id` are kept contiguous and the stimulus renders once) · `practice_sets` (or assessments with type=practice)
**Delivery:** `assignments` (assessment ↔ class, window, code, time limit, attempts allowed, review mode, **retake threshold** default 80) · `attempts` (student, assignment, number, **scope**: full or list of target ids, version/question set served, status, score, started/finished) · `responses` (attempt ↔ question, answer, auto score, manual score, flags) · `attempt_target_scores` (attempt ↔ learning target: points earned / possible, percent) · `assignment_final_scores` (student ↔ assignment: per-target best + combined total, recomputed after each attempt)

`assessment_sections` carries a `learning_target_id` so each summative section maps to exactly one target; a retake attempt has `scope` = the below-threshold targets and serves only those sections' pools.
**Learning cycle:** `corrections` (attempt, question, student's correct answer, explanation, status: submitted/approved/returned, AI flag, reviewer) · `relearning_activities` (owner, kind: video|reading|link|guided_notes, content/media/url, prompts JSONB) · `activity_targets` (activity ↔ learning target) · `activity_completions` (student, activity, completed_at, evidence JSONB e.g. watch %, teacher_verified) · `practice_sets` (owner, questions or pool ref) · `practice_set_targets` · `practice_attempts` (student, set, answers, score, completed_at) · `retake_gates` (student ↔ assignment ↔ target: corrections_ok, activity_ok, practice_ok, unlocked_at — recomputed by a server function after every relevant event) · **`worksheets`** (script_id unique, title, student_url, course, counts_as: practice|activity|both, section_target_map JSONB) · **`worksheet_events`** (worksheet, student, event: submit|progress, score, section_scores JSONB, cards_correct, total_checks, received_at) · `assignment_pins` (assignment ↔ target ↔ pinned activity/set, optional)
**Relearning revamp (ticket R1, migration `0030_relearning_revamp`; `docs/relearning-revamp-plan.md`):** `relearning_options` (owner, target, mode: read|watch|do, title, description, published; one per target per mode per teacher) · `relearning_sections` (option, **part: core|extension**, order, body JSONB: text|video|interactive|flashcards|worked steps, uploaded video, quick checks JSONB with server-side keys, short-answer prompt, est. minutes) · `relearning_paths` (one row per student × assignment × target: mode, option, added, sections served, progress, started/finished, checked off by; a quiz's stitched activity = the rows sharing `bundle_id`) · `practice_checks` (assignment, student, purpose: path|attempt, target ids, the relearning bundle or the attempt number it unlocks, pass mark, passed at) + `practice_check_rounds` (number, question set, first answers, score, finished) · `relearning_video_flags` (section, student, assignment, error code, hits, resolved) · `assignments.practice_pass` (default 4) · **`courses.relearning_path_from`** (timestamp; null = old rules, so Anatomy stays null) · `FinalBasis` gains `relearning_path` and `corrections_to_90`. The v2 gate tables (`retake_gates`, `activity_completions`, `practice_attempts`) stay for assignments taken before launch.
**Sharing:** `shares` (bank/assessment ↔ user, permission)

Key idea, again: **questions are independent records; assessments point at them.** Attempts store the exact question set served so retakes and analytics are reproducible.

---

## 9. Phased roadmap (revised)

**Phase 0 — Foundation (1–2 weekends)** — *complete, Sept 22, 2026. Live at https://bloom-iota-six.vercel.app (Vercel project `bloom`, Neon `bloom` in us-east-2 via the Vercel integration, repo github.com/EricksonJ-beep/TestPlatform).*
Repo, Next.js + Tailwind + shadcn scaffold, Neon project + Drizzle schema/migrations, server-side authorization layer with tests, Auth.js email/password for teacher + student, design tokens, dashboard shell.
*Outcome:* both teachers can log in; a student account can be created.

**Phase 1 — Working builder + students take tests (the goal)** — *built, Sept 22–29, 2026 (tickets 1.1–1.18); the classroom checkpoint in PHASE1.md is Jon's to run.*
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

**Relearning revamp (approved Nov 4, 2026)** — `docs/relearning-revamp-plan.md`.
- **Platform:** R0 spec updates · R1 schema · R2 the path rule · R3 practice check · R4 Read · Watch · Do · R5 step path UI · R6 test retake picker · R7 gradebook history · R8 Skyward export.
- **Content, built alongside:** C1 Physical Science practice banks to about 100 per target · C2 Physical Science Read · Watch · Do · C3 Biology practice banks (33 targets × about 100) · C4 Biology Read · Watch · Do.
- **L1 launch:** Physical Science and Biology switch over together once all of it is done; assignments taken before launch keep the v2 rules.

*Outcome:* students earn a retake through one short, guided path: about 10 min of relearning on a quiz (10–15 per target on a test) plus a 5-question check.

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
| Summative retake = | **Targeted:** targets below 80% are **required**; targets ≥80% are **optional** (student opts in, on by default); new questions from each selected target's pool, same question count as the original section. From the relearning launch (Nov 4, 2026): the student may pick **Full test** or **Custom**, and an added optional target needs corrections only |
| Relearning monitor = | Per-student view of each target's progress + time on task per target with a readiness summary; class table sortable by readiness (Phase 1, alongside the tier board). Shows the three gates before the relearning launch, and the path after it (corrections · relearning mode and checks · practice check rounds) |
| Worksheets = | Existing Apps Script worksheets count as practice sets (or activities) via a signed webhook on final submit; student Bloom email = Cadott Google email; section titles carry LT labels so one worksheet can satisfy several targets |
| Retake gates = | **From the relearning launch (Nov 4, 2026):** per target below 80%, corrections + one Read · Watch · Do relearning + a 5-question practice check passed at 4/5; on a test, an added optional target needs corrections only; relearning opens when corrections are submitted. **Before it (and for assignments taken before it):** per required (or opted-in) target, corrections approved + ≥1 relearning activity completed + ≥1 practice set completed (completion, not score); any tagged item counts by default, and the teacher may pin specific ones per assignment |
| Retake threshold = | 80% per learning target (configurable per assignment) |
| Grade after retake = | Highest counts — per target for summatives (max per target, then summed). Formatives: per target from the relearning launch (each quiz target goes to Skyward on its own); per attempt before it |
| Summative structure = | One section per learning target, each with its own pool |
| Tier board = | Tier 1: 0 targets < 80% · Tier 2: 1–2 · Tier 3: 3+ (boundaries configurable); live via polling, push later if wanted |
| Competitor review (Sept 15, 2026) — approved additions | **Shared stimulus** (Phase 1) · **Numeric grading modes + units** (Phase 1) · **Dynamic numeric variants** (Phase 2) · **Google Classroom roster import** (Phase 2) |

**Parked — reviewed, NOT approved (do not build unless Jon says so):** categorize/bucket questions · show-your-work drawing · audio response · file-upload response · word bank for fill-in-blank · build-a-test-from-existing-tests · AI rubric scoring of written responses · time-per-question analytics · per-distractor feedback · teacher-pace mode · certificates · email reminders · student self-registration.
| Student login = | Email + password (Auth.js Credentials + bcrypt); Google later if wanted |
| Infrastructure = | **Neon + Drizzle + Auth.js + Cloudflare R2 + Vercel** (decided Sept 21, 2026; replaces Supabase — free-tier auto-pause and slot limits) |
| Practice source = | Curated sets you build and publish; since Oct 13, 2026 built in Bloom from per-target banks (about 50 questions per learning target), not Apps Script; plus student-built practice by unit and learning target from banks you open for practice (Oct 13, 2026). Nov 4, 2026: Physical Science and Biology Practice banks grow to about 100 per target, and the retake's practice check draws from Practice banks only |
| Practice checking = | **Study practice:** Apps Script style: try again after a miss, hint after 3 misses, Show answer any time; complete when every question is closed; deals balanced 3:4:3 easy/medium/hard. **Practice check** (the retake gate from the relearning launch): 5 questions, 3 easy · 1 medium · 1 hard, at most one true/false, the first answer counts, 4/5 passes, Look back and then a fresh 5 |
| Sharing at launch = | You + one physical science colleague, shared bank |
| Skyward = | Track the counting score + **one CSV per Skyward assignment** (header `Last Name,First Name,ID,Score`; percent, whole number; quizzes one file per learning target, tests one overall score; ID = the digits before the @ in the student's Cadott email); no direct integration in v1 |
| Formative attempts = | Default 3, configurable per assignment |
| Corrections review = | Per-assignment: auto-unlock or teacher-approved (AI first-pass). From the relearning launch, relearning and the practice check open on submit; only the raised quiz score and the retake wait for approval |
| Relearning (Nov 4, 2026) = | The student picks **Read · Watch · Do**; each has a core (3–5 min) and an extension (5–10 min), with quick checks (unlimited tries) and at most one short answer. A quiz on 2+ targets stitches the cores (about 10 min); tests use core + extension per target (about 10–15 min). Watch uses YouTube in Restricted Mode (each video tested on a student account) or Jon's uploads |
| Quiz path (Nov 4, 2026) = | Per target. Below 80%: corrections + relearning + practice check → 80% automatically, then keep it or retake. At/above 80%: corrections → 90%, plus the path → 100%, no retake. Attempt 3 needs a fresh 4/5 check. The path stays open after a quiz closes (then Ask to retake) |
| Student view (Nov 4, 2026) = | **Step path** (subway-map circles) with one Next step box and one button, on the home row, the card and the assessment page |
| Score history (Nov 4, 2026) = | Every score shows its trail (40 → 80 → 95), each step dated, in the gradebook, results and My results |
| Relearning rollout (Nov 4, 2026) = | Physical Science and Biology launch together once their practice banks and Read · Watch · Do content are built (ticket L1); assignments taken before launch keep the old rules; Anatomy (CVTC) unchanged |

**Still open (defaults assumed):** standards framework (assume your own learning targets + NGSS codes optional).

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
`external_id, course, unit, topic, learning_target, standard, pool, type, stem, stimulus_ref, stimulus_text, stimulus_image_url, stimulus_video_url, option_a, option_b, option_c, option_d, option_e, option_f, correct, tolerance, tolerance_mode, unit, points, difficulty, bloom, grading, explanation, hint, image_url, video_url, tags`

`hint` (optional) is shown in practice after the third miss. For `fill_blank`, `tolerance_mode` = `case_sensitive` makes the accepted answers match capitals exactly (chemical formulas: CO is not Co); subscript digits a student pastes (CaCl₂) always read as plain digits.

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
        url:       ScriptApp.getService().getUrl(),
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
