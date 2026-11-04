# Relearning revamp: a shorter, clearer path to the retake (Jon, Nov 2–4 2026)

**Status: approved by Jon, Nov 4 2026. R0 (spec updates) and R1 (schema) are done; R2 is
next. Nothing else below is built yet.**

Jon's ask: "Right now the students are struggling with the corrections, activity, and then
practice. I think it is too much for them to 'earn' a retake. The correction piece is working
good… the relearning is taking too much time. I would like the relearning to be more specific
and be able to be accomplished in 15–20 minutes… I like the reading element of it… 3 different
learning options that students can choose… then practice… 5 multiple choice questions and they
have to get 4/5 in order to unlock the retake… from the question banks."

Then, from his classroom: "make the UI a lot more visually appealing and help guide those
students so that they can continue the process on their own," plus the quiz scoring, per-target
tests, gradebook history and a Skyward import that matches his gradebook.

Scope: **Physical Science and Biology.** Anatomy & Physiology (CVTC) is out of this build. Its
retakes are quiz-only and corrections earn no credit there (`cvtcRules`), so it keeps today's
rules.

## The idea in one picture

Think of it like a subway line. Every student rides the same line, and each stop is one short
job. The map always shows which stops are done, which one they're at, and what's still ahead.
The student never has to guess where to go next.

```
Quiz, scored 40%:
 (✓)────────(✓)────────( 3 )────────( 🔒 )────────( 🔒 )
Corrections  Relearn   Practice    80% earned    Retake
   done       done     4 of 5                    optional

Test, LT2 at 65% and LT4 at 70% (one line per target):
 LT2   (✓)──────────(✓)──────────(✓)      ready
 LT4   (✓)──────────( 2 )────────(🔒)     relearning
    Corrections   Relearn     Practice
 Retake unlocks when every line is ✓
```

## Jon's decisions (Nov 2–4 2026)

| #   | Question                                                             | Jon's answer                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which assessments get the new flow?                                  | **Quizzes and tests**, Physical Science and Biology. Anatomy stays out ("it is a CVTC class and retakes are only allowed on quizzes").                                                                       |
| 2   | Corrections                                                          | **No change**: "the correction piece is working good."                                                                                                                                                       |
| 3   | Relearning options                                                   | **Read · Watch · Do.** The student picks one.                                                                                                                                                                |
| 4   | How long?                                                            | **Quiz: about 10 min. Test: about 10–15 min per learning target.**                                                                                                                                        |
| 5   | Quiz with several missed targets                                     | **One activity covers all.** Bloom stitches together the sections for the targets they missed, so the total stays near 10 min.                                                                                                     |
| 6   | Test with several missed targets                                     | **Separate per target.** Each target below 80% gets its own short Read, Watch or Do, and its own practice check.                                                                                              |
| 7   | What proves the relearning was done?                                 | **Quick checks with unlimited tries** (multiple choice / fill-in) inside the reading or paused in the video. **At most one short answer**, "if needed and it made sense."                                    |
| 8   | Watch: where do videos come from?                                    | **Mix.** Claude suggests short YouTube videos with timestamps and checks; Jon approves or swaps them, and adds his own recordings over time.                                                                         |
| 9   | Do: what kind?                                                       | **Claude picks by target, with variety on a solid structure:** drag-and-drop (labeling / sorting / matching), flashcard sets, step-by-step worked problems for math targets.                                 |
| 10  | Practice check size                                                  | **5 questions, 4/5 to pass.** Tests: 5 per target. Quizzes: 5 total, split across the missed targets (2 targets → 3 + 2, extra to the weakest).                                                                |
| 11  | Practice difficulty                                                  | **3 easy · 1 medium · 1 hard**, served in that order.                                                                                                                                                      |
| 12  | Practice source                                                      | **Practice banks only**, never Quiz, Test or Retake banks. **Grow them to about 100 questions per learning target.**                                                                                           |
| 13  | Question types in the check                                          | **Any auto-graded type**: multiple choice for concepts, numeric for math targets, matching / fill-in where they auto-grade. Never short answer.                                                               |
| 14  | Scoring a practice answer                                            | **First try counts.** One answer per question, then right/wrong + explanation.                                                                                                                             |
| 15  | Below 4/5                                                            | **New 5 after a re-look.** The student sees what they missed with explanations (and can reopen their relearning), then gets a fresh 5, unseen questions first. Unlimited rounds.                                |
| 16  | Old 10-question practice sets                                        | **Keep for studying.** They stay in the Practice tab as "Study practice" and no longer count toward a retake.                                                                                                  |
| 17  | Quiz below 80% (e.g. 40%)                                            | **Corrections + relearning + 4/5 practice → 80%**, raised **automatically**. Then the student chooses: keep the 80%, or retake the quiz (same number of questions) to go higher. Highest counts.            |
| 18  | Quiz at 80% or higher                                                | **Corrections → 90%; the full path → 100%.** No retake needed.                                                                                                                                             |
| 19  | Test retake                                                          | Unlocks when every target below 80% has corrections + relearning + 4/5. The student picks **the full test** or **a custom test** of chosen targets (below-80% targets always included). Highest per target. |
| 20  | Student view                                                         | **Step path** (connected circles, subway-map style) with one big "next step" box and its single button. Vertical on a phone.                                                                                 |
| 21  | Gradebook                                                            | **Updates live and shows the history**: "40 → 80" with a badge for the path, then the retake.                                                                                                                  |
| 22  | Skyward: how Jon enters grades                                       | **Quizzes per learning target** (F_LT1U2, F_LT2U2…). **Tests as one score** (S_LT1,2,3,4U2).                                                                                                               |
| 23  | Skyward: points or percent                                           | **Export as a percent.** Jon moves every Skyward column to 100 points starting next unit.                                                                                                                  |
| 24  | Skyward "Other ID"                                                   | **The lunch code, which is the number at the start of the student's school email** (e.g. 2977@…). Bloom reads it from the email; no uploads.                                                                  |
| 25  | Quiz on several targets: raise per target or whole quiz?             | **Per target.** Each target's percent is raised on its own, matching the per-target Skyward columns.                                                                                                      |
| 26  | Students partway through the old cycle at launch                     | **Finish on the old rules.** Assignments already taken keep the old gates; the new path starts with assignments taken after launch.                                                                          |
| 27  | Skyward header row                                                   | **Include it**: `Last Name,First Name,ID,Score`. Confirm on the first test import.                                                                                                                          |
| 28  | "Keep my 80%"                                                        | **Done for now.** It marks the path finished; the retake stays available until the retake window closes.                                                                                                    |
| 29  | Test: an 80%+ target the student adds to a custom retake             | **Corrections only** on that target's missed questions. No relearning or practice for it; they already showed 80%.                                                                                          |
| 30  | Teacher-approved corrections: when does relearning open?             | **When corrections are submitted.** Relearning and practice go ahead; only the raised quiz score and the retake wait for Jon's approval. Corrections sent back get fixed, and the relearning and practice stay done. |
| 31  | Mixed quiz (LT1 at 40%, LT2 at 90%)                                  | **LT1 required, LT2 optional.** LT1 needs the full path for 80%. LT2: corrections → 90%, and the student can tick "Add LT2" to fold it into the same relearning and practice check → 100%.                    |
| 32  | Quiz attempt 3 (after a retake that came in low)                     | **A fresh 4/5 check first**, on the targets still below 80% on the retake. No new corrections or relearning.                                                                                               |
| 33  | After a quiz closes                                                  | **The path stays open** with no deadline, so the 80% can still be earned. Once it's done, the student can **Ask to retake**, and Jon's Approve reopens the quiz for them (today's rule).                   |
| 34  | Rollout                                                              | **Build Biology's practice banks as part of this plan**, "so everything is ready to go when this all rolls out." Both courses launch together; content is built alongside the platform.                     |
| 35  | True/false in the practice check                                     | **At most one per check** (a first-try true/false is a coin flip).                                                                                                                                       |
| 36  | One target, two time budgets                                         | **Core + extension.** Each target's Read / Watch / Do has a short core and an extension. Quizzes on 2+ targets use cores only; single-target quizzes and tests use both.                                     |
| 37  | YouTube on student Chromebooks                                       | **Restricted Mode.** Favor channels that usually pass, and test every video on a student account before it goes live.                                                                                      |

## Rules

### Quiz (formative) rules: replace the corrections cap and quiz-practice rules

On a quiz, everything works **per learning target** (decision 25). The quiz's total is the
combination of its targets' counting percents, and Skyward gets each target's percent.

- **Q1. Targets below the threshold (default 80%) are required.** Their path is Corrections →
  Relearn → Practice check, and each step opens when the one before it is done (see Q7 for
  teacher-approved corrections). Corrections alone raise nothing; this replaces
  `correctionsCeiling`'s corrections-only lift. When the check passes, each required target
  becomes the threshold automatically, with basis `relearning_path` (a new `FinalBasis`).
- **Q2. Targets at or above the threshold are optional.** Corrections on that target's missed
  questions → max(attempt 1, 90), with basis `corrections_to_90`. Ticking **Add LT2** folds the
  target into the same relearning activity and check, and passing → 100 (`relearning_path`). A
  target at 100% has nothing to do. A quiz where every target is 80% or higher has no required
  path and no retake (decision 18).
- **Q3. One stitched activity.** The student picks Read, Watch or Do once. Bloom builds it from
  that mode's sections for every target on the path, required plus any added. With one target,
  it uses core + extension (about 10 min). With two or three, it uses cores only (about 3–5 min
  each).
- **Q4. One practice check** of 5 covers every target on the path. It's split evenly with the
  extra going to the weakest: 1 target gets 5, 2 get 3 + 2, 3 get 2 + 2 + 1. 4/5 passes and
  raises every target on the path.
- **Q5. Retake.** It unlocks when every required target's path is done, plus Jon's approval of
  the corrections in teacher-approved mode. The end of the path offers **Keep my 80%** (done for
  now; the retake stays available until the window closes) or **Take the retake**. The retake
  serves the whole quiz with the same number of questions, and its score stands on its own.
  **The highest score counts per target.** The attempt limit (3) and the 7-day window are
  unchanged.
- **Q6. Attempt 3.** After a retake, attempt 3 opens once the student passes a **fresh 4/5
  check on the targets still below 80% on the retake**. There are no new corrections and no new
  relearning. If every target was 80% or higher on the retake, attempt 3 opens without a check.
- **Q7. Teacher-approved corrections.** Relearn and the check open as soon as corrections are
  **submitted**. The raised score and the retake wait for Jon's approval. If corrections are sent
  back, the student fixes them, and their relearning and check stay done.
- **Q8. After the quiz closes.** The path stays open with no deadline, just as corrections do
  today, so a student can still earn the 80%. Once the path is done, a closed quiz shows **Ask
  to retake**. Jon's Approve reopens it for that student until the end of the next school day
  (today's reopen rule).

### Test (summative) rules: replace the three-gate checklist

- **S1. Required targets** are the targets below 80% on attempt 1, with corrections on their
  missed questions.
- **S2. Per required target:** Corrections ✓ → Relearn ✓ → Practice check ✓. Relearn means
  picking Read, Watch or Do for this target and doing core + extension, about 10–15 min. The
  practice check is 5 questions on this target, and 4/5 passes. Targets move along their lines
  independently, so LT2 can be ready while LT4 is still relearning.
- **S3. The retake unlocks** when every required target has passed its check, plus Jon's
  approval of the corrections in teacher-approved mode (relearning opens on submit, as in Q7).
  The picker offers **Full test** (every target) or **Custom** (required targets locked in;
  targets at 80% or higher are tick boxes). **A target the student adds needs corrections on its
  missed questions first, and nothing more** (decision 29). Full test adds every target, so it
  needs corrections on every missed question.
- **S4. Scoring** is unchanged: the highest score per target, combined into one test score.
- **S5. No partial credit** along the way on a test. The path unlocks the retake, and the retake
  earns the score.
- **S6. After the test closes,** the path stays open, and a ready retake shows **Ask to retake**,
  as Q8 says for quizzes.

### Practice check rules (both)

- **P1. Dealing.**
  - Questions come only from the target's **Practice bank(s)** (`bank-kinds.ts` kind `practice`).
  - Only auto-graded types are used: no `short_answer` and no written answers. There's **at most
    one true/false** per check.
  - The check holds 3 easy, 1 medium and 1 hard, using today's bands in `serve.ts`: difficulty
    1–2 is easy, 3 is medium, and 4–5 is hard. Across a split check, the whole check still holds
    that mix, and each target gets at least one easy question.
  - Unseen questions come first. If a band runs short, Bloom borrows from the next band and
    flags the bank as thin on the teacher's side.
- **P2. Answering:** one answer per question, then right/wrong and the explanation. No retry and
  no hint inside the check. Score = first answers correct.
- **P3. Below 4/5:** a **Look back** screen lists the missed questions with their explanations
  and a "Reopen my relearning" link. Its **Try a new 5** button deals a fresh hand. Rounds are
  unlimited, and the relearning monitor shows every round.
- **P4. Teacher setting:** pass mark per assignment, default 4 of 5. The size is fixed at 5.
- **P5. Where checks run:** the quiz path (Q4), a quiz's attempt 3 (Q6) and each test target
  (S2).

### Relearning activity rules (both)

- **A1. Three modes per target:**
  - **Read:** a short reading with an analogy, worked examples, and quick checks along the way.
  - **Watch:** a video, YouTube or Jon's own, with quick checks at set timestamps. The video
    pauses until the check is answered.
  - **Do:** drag-and-drop labeling, sorting or matching; a flashcard set ending in a short
    self-quiz; or step-by-step worked problems that reveal one step at a time. Claude chooses
    the format per target, with variety (decision 9).
- **A2. Core + extension** (decision 36). Every target's Read, Watch and Do has two parts:
  - **Core,** about 3–5 min: the key idea, one example or clip, and 1–2 quick checks.
  - **Extension,** about 5–10 min: more examples and checks, plus the one optional short answer.

  Quizzes with 2+ targets on the path use cores only; single-target quizzes and tests use both.
  For Watch, the two parts can be two segments of one video or two short videos.
- **A3. Credit:** every quick check answered correctly (unlimited tries, so no one gets stuck),
  plus the short answer if that part has one. Read also needs the reading scrolled to the end;
  Watch also needs 90% of each video segment watched.
- **A4. Choice:** the student can switch modes until they finish one. After that it's locked
  for that target (test) or that quiz.
- **A5. Fallback:** if a target has only one or two modes built, the student sees what exists.
  If it has none, the step shows "Your teacher will give you a relearning activity," and Jon can
  check it off from the relearning monitor (as `activity_completions.teacher_verified` does
  today).
- **A6. Videos under YouTube Restricted Mode** (decision 37):
  - Suggestions favor channels that usually pass (Amoeba Sisters, Crash Course, Bozeman), and
    every video is played on a student account before it goes live.
  - If a video still won't play (the player reports an error), the Watch card says "This video
    won't play here. Pick Read or Do," and the switch doesn't lock the student out. The video is
    flagged in Jon's Needs you.
  - Jon's own recordings upload to Bloom's file storage, so YouTube filtering never affects them.

### Gradebook and Skyward rules

- **G1. History everywhere:** each score shows its trail, e.g. **40 → 80 (path)** or
  **40 → 80 → 95 (retake)**. Hovering or tapping lists each step and its date. This appears in
  the class gradebook cell, the results table and the student's My results. In teacher-approved
  mode, the "→ 80" step appears when Jon approves.
- **K1. One Skyward file per Skyward assignment.**
  - The first line is the header `Last Name,First Name,ID,Score`. Then there's one row per
    student, with Score as a **percent** (whole number, rounded half up).
  - Quiz: one file per learning target on the quiz, each with that target's percent. File names
    follow Jon's columns, e.g. `F_LT3U2.csv`.
  - Test: one file with the overall percent, e.g. `S_LT1,2,3,4U2.csv`.
  - Several files come as one download: a .zip, plus a single-file button for each.
- **K2. Other ID** = the digits before the @ in the student's Bloom email (their Cadott Google
  email). No digits → blank ID, and the export page lists "No Skyward ID: Ana Lopez (email …)"
  so Jon can fix the account first.

## Student view

- **StepPath** (new component): connected circles labeled Corrections · Relearn · Practice ·
  80% earned (or 100%) · Retake.
  - Done: green check plus a date. Current: teal, larger, pulsing ring. Locked: gray with a lock
    and a one-line reason ("Opens after your corrections").
  - Under the path, one **Next step** box has a headline, a time estimate ("About 10 minutes")
    and **one button**.
- **Several targets:** tests show one line per required target, stacked, with a "Retake unlocks
  when every line is ✓" footer. A quiz shows one line per target only when more than one target
  has work to do; otherwise it shows a single path.
- **Optional quiz targets** show a tick box: "Add LT2 (90%) to reach 100%. Adds about 3–5
  minutes."
- **Waiting on Jon** (teacher-approved mode): the corrections circle reads "Turned in, waiting
  for your teacher's OK," and the Next step box keeps them moving with "Start your relearning
  while you wait."
- **The end of a quiz path** shows two big choices side by side: **Keep my 80%** (done for now)
  or **Take the retake**.
- **Where it shows:** the home To do rows (a mini path), the assessment card (a mini path in
  place of the status pill text) and the assessment page (the full path). It uses the same
  shared rule as the teacher gradebook, so they always agree.
- **Relearn picker:** three big cards, **Read 📖 · Watch 🎬 · Do 🧩**, each with a one-line
  description and "About N min."
- **Phone / Chromebook:** the path becomes a vertical list, with the Next step box first.

## Teacher side

- **Relearning monitor and tier board** get the new stages: corrections → relearning (mode,
  progress) → practice (rounds, best) → ready → retake.
- **Activity builder:** per target, a Read / Watch / Do slot, each with a core and an extension
  made of sections. A section holds rich text or a video (YouTube URL or upload) with
  timestamps, its quick checks, and an optional short answer. Content packs can load all three.
- **Needs you:** "Video won't play" flags (A6), with the video and how many students hit it.
- **Bank health:** on Question banks, each Practice bank shows its count by difficulty and type,
  flagged when a band can't fill a deal.
- **Course setting:** "New relearning path from [date]," set for both courses at launch (L1).

## Build tickets (commit after each green "Done when")

The platform tickets (R0–R8) and the content tickets (C1–C4) run side by side. **Launch (L1)
waits until all of them are done,** so both courses switch over together (decision 34).

Content is the longest part of the job: about **4,575 new practice questions** (1,275 Physical
Science + 3,300 Biology) and **58 targets × 3 modes**, each with a core and an extension.

### R0 · Spec updates ✅ (Nov 4 2026; waiting on Jon's read)
- Update PLAN.md (§2 attempt table, §3.7, §4 steps 2–5 and rules, §9 Skyward, §10 student
  screens) and docs/decisions.md with decisions 1–37.
- Mark the replaced rows as superseded: Retake gates, Practice checking, Corrections cap, and
  Student to-do rules R3.

**Done when** PLAN.md and decisions.md match this plan and Jon has read them.

### R1 · Schema ✅ (Nov 4 2026; migration `0030_relearning_revamp`)
- `relearning_options`: one Read, Watch or Do per target per teacher (owner, target, mode,
  title, description, published). It's a table of its own rather than a new activity kind, so
  the v2 activity lists and their completion rules never see it.
- `relearning_sections`: option, **part (core | extension)**, order, title, a body (text,
  video, interactive page, flashcards or worked steps), an uploaded video, quick checks (their
  keys stay on the server), the short-answer prompt, and minutes (1–30).
- `relearning_paths`: one row per student × assignment × target (unique), with the mode, the
  option, `added` (an optional quiz target ticked for 100%), the sections served, progress,
  started/finished, and `checked_off_by` (A5). A quiz's stitched activity is the rows sharing a
  `bundle_id`; a test target's row is a bundle of its own.
- `practice_checks`: assignment, student, purpose (path | attempt), the targets, the bundle it
  follows or the attempt number it unlocks, the pass mark when it began, and when it passed.
  `practice_check_rounds`: round number, the questions served, first answers, score, finished.
- `relearning_video_flags`: section, student, assignment, error code, hits, resolved.
- `assignments.practice_pass` (default 4, 1–5) and **`courses.relearning_path_from`**
  (a timestamp; null = old rules, so Anatomy stays null).
- `FinalBasis` gains `relearning_path` and `corrections_to_90`.

The migration is additive and re-runnable, like 0023–0029, and the old gate tables stay for
assignments taken before launch.

**Done when** `drizzle-kit generate` is clean, the migration applies to a Neon branch and the
existing tests pass.
*Checked Nov 4:*
- *`drizzle-kit generate` reports no changes.*
- *All 31 migrations apply with `drizzle-kit migrate` on a local Postgres (PGlite), and a second
  run is a no-op. 0030 also re-runs on a database that already has it.*
- *572 tests pass (`src/db/relearning-schema.test.ts` covers the new rules).*
- *There is no Neon branch: preview builds use the live database, so the first real apply
  happens when this branch is pushed.*

### R2 · The rule (pure functions + tests)
- New `src/lib/relearning-path.ts`: `pathFor({ type, threshold, attempt1PerTarget, corrections,
  relearning, practice, attempts, closed })` → each target's steps, the current step, locked
  reasons and the counting score, per Q1–Q8 and S1–S6.
- An assignment uses it when its attempt 1 finished on or after its course's
  `relearning_path_from`. Otherwise the old gates (`gates.ts`, `quiz-practice.ts`) apply.
- Wire it into `deriveCardState`, `assertRetakePrerequisites`, `requestRetake`, `cycleState`,
  `gates.ts`, the class gradebook and Needs you.
- For this flow, that retires `PRACTICE_PASS_PERCENT` in `quiz-practice.ts` and
  `correctionsCeiling`'s corrections-only lift.

**Done when** unit tests cover:
- 40% quiz: no raise after corrections alone, 80 after the path, then a retake to 95.
- 85% quiz → 90 → 100. 100% quiz: nothing to do.
- Mixed quiz at 40/90: LT1 required. LT2 corrections → 90; with LT2 added, the stitched check
  splits 3 + 2 and passing → LT1 80, LT2 100.
- Retake highest per target; attempt 3 after a fresh check on targets below 80 on the retake,
  and with no check when none are below.
- Teacher-approved: relearning opens on submit; the raise and the retake wait for approval;
  returned corrections don't reset relearning or practice.
- Closed quiz: the path finishes after the close → Ask to retake.
- Test with LT2 and LT4 below: per-target lines, retake locked until both pass. Custom with LT1
  added needs LT1's corrections only; Full test needs corrections on every missed question.
- Course switch: a pre-launch assignment keeps the old gates; CVTC (Anatomy) unchanged.

### R3 · Practice check
- Dealer (P1): Practice banks, auto-graded only, at most one true/false, 3E/1M/1H across the
  whole check, unseen first, band borrowing.
- Runner (P2): first try counts, then explanation.
- Look back screen and Try a new 5 (P3).
- Results feed R2.

**Done when** a student can fail a check, see the Look back, pass a fresh 5, and the path and
counting score update. Tests cover:
- the dealer's split (1 target: 5; 2 targets: 3 + 2 to the weaker; 3 targets: 2 + 2 + 1, each
  with an easy question);
- the true/false cap;
- band borrowing.

### R4 · Relearning activities: Read · Watch · Do
- Section renderer for Read (rich text plus inline checks) and Watch (YouTube IFrame API: pause
  at timestamps, show the check, resume; 90% watched; uploaded videos too).
- The A6 "won't play" fallback and flag.
- Do: reuse `interactive` drag-and-drop pages; new **flashcards** (flip deck plus a 3-card
  self-quiz) and **worked steps** (reveal one step at a time, a check after each).
- Core + extension (A2), stitching for quizzes (Q3), picker (A4), fallback (A5), and the
  activity builder plus content-pack support.

**Done when** one Physical Science target has all three modes working end to end with core and
extension. A quiz on two targets must stitch their cores into one activity, and a blocked video
must offer Read or Do and land in Needs you.

### R5 · Step path UI
- StepPath component, Next step box and Relearn picker.
- Test per-target lines, the quiz optional-target tick box and the waiting-on-Jon state.
- The quiz end choice (Keep my 80% / Take the retake).
- Placement on home, cards and the assessment page, plus the phone layout.

**Done when** Jon walks a test student through a 40% quiz, a 40/90 mixed quiz and a two-target
test on a Chromebook and a phone without help text, and the student's path matches the teacher
gradebook cell at every step.

### R6 · Retake picker for tests
Full test or Custom (S3), using `planRetake`'s required/optional split. A target added beyond
the required ones asks for its corrections first.

**Done when** a student with LT2 and LT4 below 80% can pick Full or Custom (LT2 + LT4, plus an
optional LT1 after its corrections), and the retake serves the right sections from each target's
pool.

### R7 · Gradebook history
The score trail (G1) in the class gradebook cell, results table, student results page and My
results. Live refresh is unchanged.

**Done when** a 40 → 80 → 95 student shows that trail in all four places, each step dated.

### R8 · Skyward export
- New export (K1, K2): per-target files for quizzes and one file for tests, each with the header
  row.
- Zip plus single-file buttons, and Skyward-style file names (editable before download).
- The "No Skyward ID" list.
- Keep the old CSV as "Detailed CSV."

**Done when** Jon imports one quiz-target file and one test file into Skyward and every student
matches.

### C1 · Physical Science Practice banks to about 100 per target
- 25 targets, today about 50 each (docs/ps-practice-banks-plan.md), so about 1,275 new
  questions, from Jon's Drive materials.
- Mix weighted toward easy, since every check draws 3 easy: about **45 easy · 30 medium · 25
  hard**. Easy questions lean on multiple choice; today 69 of the roughly 370 easy questions are
  true/false.
- All auto-graded: numeric for math targets, multiple choice / matching / fill-in for concepts.
- Same self-check (every key verified, every number recomputed) and spot-check review as before.
- Delivered in packs, one unit at a time.

**Done when** every PS target's Practice bank has about 100 live auto-graded questions and its
bank health shows no thin band.

### C2 · Physical Science Read · Watch · Do (25 targets)
- **Read:** the existing reteach readings, split into core and extension, with inline checks.
- **Watch:** suggested videos (Restricted Mode-friendly) cut into core and extension segments
  with checks. Each is played on a student account, and Jon approves or swaps it.
- **Do:** per target and varied (drag-and-drop, flashcards, worked steps), each with a core and
  an extension.

**Done when** every PS target has all three modes, and Jon has approved the video list after
the student-account test.

### C3 · Biology Practice banks (33 targets × about 100)
- Biology has Retake banks but no Practice banks, so this is about 3,300 new questions from
  Jon's Drive materials.
- Same mix and checks as C1, one unit at a time, starting with the unit Jon is teaching next.
- Built alongside the platform tickets, not after them.

**Done when** every Biology target has a Practice bank of about 100 questions with no thin band.

### C4 · Biology Read · Watch · Do (33 targets)
Same as C2.

**Done when** every Biology target has all three modes and its videos are approved.

### L1 · Launch
- Set `relearning_path_from` on Physical Science and Biology to the launch date.
- Assignments taken before it finish on the old rules (decision 26).
- A short "how your path works" card shows on each student's home the first time.

**Done when** a fresh quiz and a fresh test in each course show the new path, a pre-launch
assignment still shows its old checklist, and Anatomy is unchanged.

## Not building (parked or out of scope)

- Anatomy & Physiology (CVTC rules stay as they are).
- Points-possible scaling for Skyward (Jon is moving every column to 100 points).
- Direct Skyward integration (still needs district approval, PLAN.md §9).
- AI-written relearning on the fly. Content is written ahead of time, checked and approved.
