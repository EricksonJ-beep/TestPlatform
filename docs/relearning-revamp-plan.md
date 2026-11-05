# Relearning revamp: a shorter, clearer path to the retake (Jon, Nov 2–4 2026)

**Status: approved by Jon, Nov 4 2026. R0 (spec updates), R1 (schema), R2 (the rule), R3
(the practice check), R6 (the test retake picker) and R7 (score history) are done. R8 (Skyward export)
is done. R4 (Read · Watch · Do) and R5 (the step path) are built and wait on Jon: videos to
pick, and a walk-through on a Chromebook and a phone. The content tickets and L1
are next.**

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

### R2 · The rule (pure functions + tests) ✅ (Nov 4 2026)
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

*Built Nov 4:*
- *The rule is `src/lib/relearning-path.ts` (`pathFor`, `pathCycle`, `pathRule`, `pathGates`,
  `splitCheck`, `pathCorrectionTargets`, `pathBlockerText`).*
- *`src/lib/queries/relearning-path.ts` reads it for many students at once. Before a course is
  switched on, that's one small query and nothing else.*
- *Wired into corrections scope, the final score, a test's retake gates, the card state,
  `startAttempt` / `requestRetake`, the retake window, the class gradebook and Needs you. Each one
  switches only when the course's switch is on.*
- *Tests: `src/lib/relearning-path.test.ts` (30) and `src/app/student/relearning-path.test.ts`
  (12, end to end with the real actions). All 614 tests pass.*

*Calls made while building (fine-print, all consistent with the rules above):*
- *A quiz with no learning targets keeps the v2 rules (there's nothing to relearn by target).*
- *A quiz with nothing below the line has every missed question open for corrections (no opt-in).
  On a mixed quiz, an 80%+ target joins corrections scope when the student opts in.*
- *With the corrections cap switched off, the path raises nothing, and corrections in scope come
  before the retake.*
- *The fresh check before attempt 3 (Q6) also applies to a test that allows a third attempt.*
- *Two Needs you blockers were added: relearning still open, and corrections waiting for the
  teacher's OK.*

*Left for later tickets (invisible until L1):*
- *R3 and R4 must call `recomputeFinalScore` after a check passes or a relearning finishes.*
- *R4 needs an action to opt into an 80%+ quiz target (`setRetakeOptIn` is tests-only today) and
  to add it to the bundle.*
- *R5 replaces the v2 words and to-do rows for path assignments: a quiz's relearning row (none
  shows yet), "corrections raise it to 90%" (the v2 text says 100%), and Needs you's "no retake"
  line.*

### R3 · Practice check ✅ (Nov 4 2026)
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

*Built Nov 4:*
- *The dealer and scoring are `src/lib/practice-check.ts`; opening a check, dealing rounds and
  first answers are in `src/lib/practice-check-server.ts`.*
- *The screen is `/student/checks/[checkId]`, with guards `requirePracticeCheckAccess` and
  `requireCheckRoundAccess`.*
- *A "Start practice check" button shows on the assignment page when a check is ready; R5's step
  path takes it over.*
- *A Practice bank is any bank in the target's course whose type (column or name) is Practice.
  A pass recomputes the final score, so the quiz raise and a test's gates follow.*
- *The dealer reports a thin bank but doesn't store it. The teacher sees the same counts in bank
  health on Question banks (Nov 5).*
- *Tests: `src/lib/practice-check.test.ts` (12) and `src/app/student/checks/practice-check.test.ts`
  (6, end to end). All 632 tests pass.*

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

*Built Nov 4 (waiting on Jon's video picks for Watch):*
- *The student page is `/student/relearning/[assignmentId]` (a test adds `?target=`). It shows
  the picker first: three cards, Read 📖 · Watch 🎬 · Do 🧩, each with "About N min". On a quiz,
  each 80%+ target is an "Add LT2 (85%) to reach 100%" tick box. Picking a card starts the
  activity. The student can switch modes until they finish, and switching back picks up where
  they left off.*
- *Sections and credit (A3):*
  - *Read: text, read to the end.*
  - *Watch: YouTube, or Jon's own upload. The video pauses for each check at its time, and 90%
    of the segment must play.*
  - *Do, three kinds: a hosted drag-and-drop page that reports when it's done, flashcards (flip
    every card, then a self-quiz), or worked steps (one step at a time, with a check after a
    step before the next one opens).*
  - *Quick checks are graded on the server with unlimited tries. The key never reaches the
    browser, and the explanation shows only once the answer is right.*
  - *The extension's short answer needs a full sentence.*
- *When every section is done, the server finishes the activity and the page offers the
  practice check (R3).*
- *Stitching (Q3): a quiz's required targets, plus any it adds, are one bundle. One target gets
  core + extension; two or more get cores only. Adding or removing a target before finishing
  re-serves the sections. A test relearns one required target at a time.*
- *A5: a target with nothing built shows "Your teacher will give you a relearning activity."
  The teacher checks it off on the relearning monitor. A quiz's whole activity checks off at
  once; a test target checks off on its own. The monitor now opens for path quizzes too.*
- *A6: a player error, or YouTube blocked outright (the script fails, or isn't ready within 15
  seconds), shows "This video won't play here. Pick Read or Do" with those buttons. It is
  flagged in Needs you ("Videos that won't play", with how many students hit it), and the
  teacher marks it "Fixed it".*
- *Content packs carry Read · Watch · Do (`relearning` in pack.json, checked by
  `scripts/check-pack.ts`). Sections update in place by position, so a student's progress
  survives an edit. The first pack is `ps-u3-lt1-relearning`: U3.LT1 Read and Do, each a core
  and an extension, with every answer checked.*
- *Watch for U3.LT1 is not in the pack. YouTube can't be reached from where this was built, so
  no video could be checked. Jon picks the videos and plays them on a student account first
  (decision 37); they go into the pack as `watch` sections with timestamps.*
- *Left for later:*
  - *~~An in-app builder. Options are written in packs for now.~~ Built Nov 5: Practice sets →
    Read · Watch · Do (`/app/practice/relearning`), a course's targets × Read / Watch / Do, each
    opening an editor with "Preview as student". Saves follow the pack rule (sections in place by
    part + order) and set `relearning_options.edited_at`; a later pack revision skips an edited
    option and lists it under `kept` in its summary.*
  - *Uploading Jon's own recordings to a section. The player already handles them.*
  - *~~The path-aware wording on the tier board's readiness lines (R5).~~ Done Nov 5.*
- *Code: rules `src/lib/relearning.ts`; server `src/lib/relearning-server.ts` (every progress
  write is one atomic statement); actions `src/app/student/relearning/actions.ts` (guard
  `requireRelearningRowAccess`) and `checkOffRelearning` / `resolveVideoFlag` in
  `src/app/app/results/actions.ts`.*
- *Tests: `src/lib/relearning.test.ts` and `src/app/student/relearning/relearning.test.ts` (one
  target end to end with the practice check opening; two-target stitching with add and remove;
  mode switching; the test target with nothing built and the teacher's check-off; the video flag
  through Needs you; another student refused). `src/lib/content-packs.test.ts` covers the
  relearning pack.*

### R5 · Step path UI
- StepPath component, Next step box and Relearn picker.
- Test per-target lines, the quiz optional-target tick box and the waiting-on-Jon state.
- The quiz end choice (Keep my 80% / Take the retake).
- Placement on home, cards and the assessment page, plus the phone layout.

**Done when** Jon walks a test student through a 40% quiz, a 40/90 mixed quiz and a two-target
test on a Chromebook and a phone without help text, and the student's path matches the teacher
gradebook cell at every step.

*Built Nov 4 (waiting on Jon's walk-through):*
- *One pure view, `buildStepPath` (`src/lib/step-path.ts`), turns the path rule's state and the
  card's cycle into the lines of steps, the Next step and the quiz's end choice. The assessment
  page, the card and the home to-do all read it, and the teacher's student panel builds the same
  to-do, so they can't disagree.*
- *The assessment page: on the path, the step path takes the place of the corrections,
  relearning and practice boxes.*
  - *Circles (`src/components/step-path.tsx`): done is a green check; waiting is an amber clock
    with "Turned in, waiting for your teacher's OK"; current is teal and larger, with a pulsing
    ring; locked is gray with a lock and its reason ("Opens after your corrections").*
  - *Under them, one Next step box: a headline, "About N minutes" and one button.*
  - *A quiz shows one path (Corrections · Relearn · Practice check · 80% earned · Retake), or a
    line per target when two or more have work. A test shows a line per required target (and per
    added target: Corrections only), with "Retake unlocks when every line is ✓".*
  - *While corrections wait for approval, the Next step says "Start your relearning while you
    wait for your teacher's OK" (Q7).*
- *The quiz end choice (decision 28) is two big buttons: **Keep my 80%** and **Take the retake**.
  Keeping it is stored (`assignment_final_scores.kept_at`, migration `0032_kept_score`, additive
  and re-runnable) and counts until the next attempt. The quiz then drops off the home to-do, and
  the card still offers the retake.*
- *A quiz's 80%+ targets get two tick boxes: "Fix my mistakes on LT2 (85%) to raise it to 90%"
  (new action `setQuizCorrectionsOptIn`) and "Add LT2 to your relearning to reach 100%" (R4's
  action, once the relearning has started; before that, on the picker).*
- *The card shows a mini path in place of its status pill, the Next step's words and its button.
  The home to-do rows are built from the Next step, with the mini path, and drop off when done or
  kept.*
- *A phone gets a vertical path with the Next step box first.*
- *Teacher wording on the path:*
  - *The gradebook cell names each target's step: "Relearning (U3.LT1: relearn, U3.LT4:
    practice check)".*
  - *"Corrections → 90%" replaces 100%.*
  - *Needs you says "corrections raise it to 90%, and the relearning path to 100%", or "They
    already have 100%".*
- *Left for later:*
  - *~~Dates on done steps.~~ Done Nov 5. A done step reads "Done Nov 4", in school time. The
    date comes from the last approval (corrections), the relearning finishing or being checked
    off, or the practice check passing.*
  - *~~The tier board's readiness lines still use the old words.~~ Done Nov 5: on the path, a
    target reads "U3.LT4: corrections ✓ · relearn ✓ · practice check ✗ · retake locked"
    (corrections the teacher hasn't OK'd yet read "waiting for your OK"). The card's relearning
    stage uses the gradebook's words: "Relearning (U3.LT4: practice check)".*
- *Tests: `src/lib/step-path.test.ts` (the 40% quiz, the 40/90 mixed quiz, the two-target test,
  waiting, keep, ask). `src/app/student/relearning-path.test.ts` covers Keep my 80%, the quiz
  opt-in, and the to-do row built from the path.*

### R6 · Retake picker for tests ✅ (built Nov 4 2026)
Full test or Custom (S3), using `planRetake`'s required/optional split. A target added beyond
the required ones asks for its corrections first.

**Done when** a student with LT2 and LT4 below 80% can pick Full or Custom (LT2 + LT4, plus an
optional LT1 after its corrections), and the retake serves the right sections from each target's
pool.

*Built Nov 4:*
- *On a test on the path, the assignment page's "Retake by learning target" panel starts with two
  big choices: **Full test** ("Every target on the test. Do corrections on every question you
  missed first.") and **Custom** ("U3.LT2 and U3.LT4, plus any target at 80% or higher you tick.
  A target you add needs its corrections first.").*
- *Full test puts every target at or above the line in the retake; its rows read "In your
  retake". Custom starts again from the required targets, and each other target gets an Add tick
  box. Ticking every box is the same as Full test.*
- *The checklist shows the path's steps. A required target shows corrections, relearning and
  practice check. An added target shows corrections only (decision 29).*
- *The choice can't change while an attempt is open. There's no choice when every target is
  required, when no attempts are left, or when the test has optional retakes turned off (then
  the retake covers the required targets only, as before).*
- *The rule is `retakeChoice` (`src/lib/retakes.ts`). The new student action is
  `chooseRetakeScope` (`src/app/student/actions.ts`, behind `requireAssignmentAccess`), which
  writes every opt-in at once (`setOptIns`). The retake still serves each chosen target's
  section from its retake pool when it has one.*
- *Tests: `retakeChoice` in `src/lib/retakes.test.ts`, and the R6 block in
  `src/app/student/relearning-path.test.ts`. Custom with LT3 added owes LT3's corrections, then
  serves LT2, LT3 and LT4. Full test owes corrections on every missed question, then serves all
  four targets.*

### R7 · Gradebook history ✅ (built Nov 4 2026)
The score trail (G1) in the class gradebook cell, results table, student results page and My
results. Live refresh is unchanged.

**Done when** a 40 → 80 → 95 student shows that trail in all four places, each step dated.

*Built Nov 4:*
- *New table `score_history` (migration `0031_score_history`, additive and re-runnable). The
  final score code (`recomputeFinalScore`) adds a row each time the counting percent changes,
  with how it came about.*
- *Scores from before R7 get a starting point once: attempt 1 (when it differs) and the score now.
  This runs on the first production deploy (`scripts/score-history-seed.ts`). Preview builds skip
  it, as they share the live database.*
- *The rule is `scoreTrail` (`src/lib/score-trail.ts`). Steps are in time order, and a repeat is
  kept once. The first step is "attempt 1". A rise is named "relearning path", "corrections" or
  "retake". A drop is a "regrade", since only a teacher's change lowers a score.*
- *Shown once a score has moved:*
  - *Class gradebook cell: "from 40 → 80 → 95", every step dated on hover and in the side
    panel.*
  - *Results table: under the student's growth line.*
  - *Relearning monitor (one student's results page): "Score history 40 → 80 → 95".*
  - *My results: "How your score got here: …".*
- *The class gradebook still reads in 12 queries. The path read is skipped where no course is
  switched on, and the trail comes from rows the gradebook already reads plus one history read.*
- *Tests: `src/lib/score-trail.test.ts`, the R7 block in `src/app/student/relearning-path.test.ts`
  (all four places, and the seed runs once), and the 0031 re-run check in
  `src/db/relearning-schema.test.ts`.*

### R8 · Skyward export ✅ (built Nov 4 2026; Jon imported every class into Skyward Nov 5)
- New export (K1, K2): per-target files for quizzes and one file for tests, each with the header
  row.
- Zip plus single-file buttons, and Skyward-style file names (editable before download).
- The "No Skyward ID" list.
- Keep the old CSV as "Detailed CSV."

**Done when** Jon imports one quiz-target file and one test file into Skyward and every student
matches.

*Built Nov 4:*
- *Results → **Skyward export** (`/app/results/[id]/skyward`) lists one file per Skyward
  assignment, each with an editable name, a Download button and a "Download all" .zip. It also
  lists students with no Skyward ID, and links the old CSV as "Detailed CSV."*
- *Files come from `/api/results/[id]/skyward`. The rules are `src/lib/skyward.ts`; the reads are
  `src/lib/queries/skyward.ts`.*
- *A quiz's target files use the per-target counting percent the path stores. A one-target quiz
  from before the path uses its counting score.*
- *A multi-target quiz from before the path uses each target's best attempt, and the page says so.*
- *Tests: `src/lib/skyward.test.ts` and the route test.*
- *Nov 5: students log in with usernames, so the lunch code now comes from the class page's
  **Lunch codes** box. The teacher pastes the school roster once, and codes are matched by name
  (`users.lunch_code`, migration 0033). Jon's imports worked for all his classes.*

### R8b · Skyward updates (Jon, Nov 5: "an efficient process to know what grades need to be changed in Skyward")
- *Bloom remembers what Skyward has (`skyward_marks`, migration 0034): the score it handed over
  for each student, in each Skyward column of an assignment.*
  - *It's recorded by a Download on the export page (now a form post, checked to come from
    Bloom's own pages) or by "Mark as entered".*
  - *The plain GET link still works and records nothing.*
- ***Skyward updates** (`/app/skyward`, linked from Needs you and the export page) lists every
  grade whose counting score is different now, by assignment and file: student · Skyward has ·
  now · why (relearning path, corrections, retake, regrade, new score) · when. "Download
  changes" gives Skyward import files of just those rows. Either way they clear.*
- *Needs you shows one row: "N grades to update in Skyward".*
- *Grades entered before tracking existed: **Start tracking** picks a course and the day Jon
  last entered its grades. From the score history Bloom works out what Skyward had then:*
  - *Unchanged since that day: today's score.*
  - *A test changed since: its score as of that day.*
  - *A quiz target changed since: no mark, so it shows as an update.*
- *Code: rules `src/lib/skyward-updates.ts`, reads `src/lib/queries/skyward-updates.ts`, page and
  actions `src/app/app/skyward/`.*
- *Tests: `src/lib/skyward-updates.test.ts` (rules) and `src/app/app/skyward/skyward-updates.test.ts`
  (end to end: records, changes with reasons, changes-only files, mark entered, start tracking,
  another teacher and another site refused).*

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

*Built Nov 4–5 (live on the next deploy; waiting on Jon's spot-check):*
- *1,275 new questions. Every one of the 25 banks now holds exactly 100: 45 easy, 30 medium, 25
  hard.*
- *All auto-graded: 672 multiple choice, 386 numeric, 74 multiple select, 51 fill-in, 29
  matching and 27 ordering among the new ones. At most 2 new true/false per target (36 in all).*
- *Every new question has a hint and an explanation. Jon's conventions hold: g = 9.8, IMA/AMA
  named in every stem, efficiency as a percent, his pulley rule, his 1904 Thomson date.*
- *Checks: `scripts/check-pack.ts` is clean on all 25 packs (no errors, no duplicate stems). An
  independent re-solve of a random 64 of the new questions found every key right.*
- *Delivered as pack revisions (Unit 1 → 4, Unit 2 → 3, Units 3–6 → 2). Each applies once and
  updates its bank in place.*
- *Bank health (built Nov 5): on Question banks, each Practice bank card shows its band counts
  ("45 easy · 30 medium · 25 hard") and a chip: Healthy, Thin, or Can't fill a deal.*
  - *The bank's page has a panel with one row per target: its band counts (colored when short or
    thin) and its question types, then what's short.*
  - *It counts what the practice-check dealer can draw: live, auto-graded questions tagged to a
    target in the bank's course. A deal is 3 easy · 4 medium · 3 hard (the larger of a check
    and a 10-question practice set). A band below one deal can't fill it; below three deals'
    worth it's thin.*
  - *Code: rule `src/lib/bank-health.ts`, read `src/lib/queries/bank-health.ts` (two queries for
    any number of banks), view `src/components/app/bank-health.tsx`.*

### C2 · Physical Science Read · Watch · Do (25 targets)
- **Read:** the existing reteach readings, split into core and extension, with inline checks.
- **Watch:** suggested videos (Restricted Mode-friendly) cut into core and extension segments
  with checks. Each is played on a student account, and Jon approves or swaps it.
- **Do:** per target and varied (drag-and-drop, flashcards, worked steps), each with a core and
  an extension.

**Done when** every PS target has all three modes, and Jon has approved the video list after
the student-account test.

*Read and Do built Nov 4–5 for all 25 targets (Watch waits on Jon):*
- *One pack per target, `ps-uX-ltY-relearning`. Read is a core and an extension text with 4
  quick checks and one short answer. Do is flashcards with a self-quiz, or worked problems one
  step at a time, varied by target. Each is "About 10 min".*
- *Sources: Jon's reteach readings and practice banks.*
- *Checks: `scripts/check-pack.ts` is clean on all 25. About 50 quick checks re-solved by hand
  were all right.*
- *Watch added Nov 5 (Jon approved the list in `docs/watch-videos/physical-science.md`):*
  - *Each target's core video is the list's first choice, and its extension is the backup.*
  - *Each video has 2 quick checks after it, on the target's core idea in Jon's wording (none
    on details only that video would have). The extension also has a short answer.*
  - *Lengths are 5 minutes unless the list gives one. The videos aren't trimmed and the checks
    don't pause the video, because nobody has timed them yet.*
  - *All 25 pass `scripts/check-pack.ts`. I re-solved 20 of the 100 checks, and all were right.*
  - *If a video won't play on a student device, the student's flag reaches Jon's Needs you
    list, and the student is offered Read or Do instead.*

### C3 · Biology Practice banks (33 targets × about 100)
- Biology has Retake banks but no Practice banks, so this is about 3,300 new questions from
  Jon's Drive materials.
- Same mix and checks as C1, one unit at a time, starting with the unit Jon is teaching next.
- Built alongside the platform tickets, not after them.

**Done when** every Biology target has a Practice bank of about 100 questions with no thin band.

*Built Nov 4–5 for all 33 targets, 3,300 questions in all:*
- *One pack per target, `bio-uX-ltY-practice`. Each has 100 questions: easy 45, medium 30,
  hard 25. They are open practice with a 10-question draw, like the PS banks.*
- *Checks:*
  - *`scripts/check-pack.ts` is clean on all 33.*
  - *A second writer re-solved every row and made 127 fixes. Most were to wording, hints or
    distractors, and a few were keys.*
  - *I re-solved a random 30 of the 3,300, and all were right.*
- *Not copied from Jon's tests:*
  - *No stem matches a Biology test or retake question.*
  - *One near-copy (U1.LT4 P013, repeated trials) was rewritten as a new scenario.*
- *Genotype fill-ins ("Bb", "hh") are graded case-sensitive (`tolerance_mode=case_sensitive`).*
- *Revision 2: a 50-question version of these packs (Oct 14, unmerged branch
  `claude/focused-goodall-4xyf49`) had already loaded through its preview build.*
  - *P001–P050 update in place, and P051–P100 are added.*
  - *Three set titles stay on their live names, so no second set is made.*
- *Longest-answer tell fixed (revision 3, Jon's call Nov 4): in 53% of the multiple-choice
  questions the right answer was the longest choice. Now it is 15% (8% shortest), and no bank is
  over 22%.*
  - *Wrong choices got the same kind of detail as the key ("because…", a condition), and a few
    padded keys were trimmed. About 1,290 choices changed in 32 banks.*
  - *A guard script confirmed that only option text (and two explanations) changed. No stem,
    answer letter or correct choice moved. Every edited row was re-read for a single defensible
    answer.*

### C4 · Biology Read · Watch · Do (33 targets)
Same as C2.

*Read and Do built Nov 5 for all 33 targets (Watch waits on Jon):*
- *One pack per target, `bio-uX-ltY-relearning`. Read is a core and an extension text with 4
  quick checks and one short answer. Do is flashcards with a self-quiz or worked steps, varied by
  target. It includes Punnett squares drawn as math grids, DNA → mRNA → amino acids with the
  codons given, and pedigrees.*
- *Sources: Jon's Biology packs and his Drive files. Fungi and Plants use standard 10th-grade
  content (no notes found).*
- *Checks: `scripts/check-pack.ts` is clean on all 33. Each writer re-solved its own checks. I
  re-solved a random 24 of the 285, and all were right. All 12 math grids render.*
- *Genotypes are never fill-ins, because fill-in grading ignores case, so "Bb" would match "bb".*

**Done when** every Biology target has all three modes and its videos are approved.

### L1 · Launch
- Set `relearning_path_from` on Physical Science and Biology to the launch date.
- Assignments taken before it finish on the old rules (decision 26).
- A short "how your path works" card shows on each student's home the first time.

**Done when** a fresh quiz and a fresh test in each course show the new path, a pre-launch
assignment still shows its old checklist, and Anatomy is unchanged.

*Ready Nov 4 (the switch itself waits for Jon and the content):*
- *Each course page has a **New relearning path** setting. Pick a date and choose "Turn on now"
  (today) or "Schedule it" (a later day, starting at midnight Central).*
  - *A past date is refused, so tests already taken keep the old rules (decision 26).*
  - *A scheduled start can be cancelled. Once it is in effect, it stays.*
  - *A CVTC course shows the switch, with a note that its own rules win.*
  - *Code: `setCourseRelearningPath` (owner only), rules `src/lib/relearning-switch.ts`.*
- *The student home shows a "How your path works" card once a student has an assignment on the
  path: four steps (fix your mistakes · relearn it your way · practice check · earn it), closed
  with "Got it", remembered on that device.*

### L0 · Walkthrough course (Jon, Nov 5: "Test course walkthrough")
A practice course to walk through the path as a student before switching the real courses on.
- *Setup (`src/lib/walkthrough.ts`, run before the packs on every deploy, `content/walkthrough/setup.json`):*
  - *Jon gets a course called **Relearning Walkthrough**, with the path switched on, and a class
    called **Walkthrough Practice Class** (joining by code is off).*
  - *Once they exist, nothing changes them again. No student is ever created.*
- *Content (`walkthrough-1` … `walkthrough-6` packs, copies of PS U3.LT1 and U3.LT2 with WT-
  question ids):*
  - *Practice banks of 82 and 80 questions.*
  - *Read · Watch · Do for both targets.*
  - *A 10-question quiz (3 attempts) and a 10-question test (2 attempts) on the class.*
  - *The test's retake pools.*
- *How Jon uses it:*
  1. *On Classes → Walkthrough Practice Class, add a pretend student. The temporary password
     shows once.*
  2. *In a private window, sign in as that student. Take the quiz and miss most U3.LT1
     questions.*
  3. *Walk the path: corrections → relearn (Read, Watch or Do) → practice check → 80% → keep or
     retake. Approve the corrections as the teacher in the other window.*
  4. *For the retake picker and two lines on the path, take the test and miss some on each
     target.*
  5. *Archive the course when done.*

## Not building (parked or out of scope)

- Anatomy & Physiology (CVTC rules stay as they are).
- Points-possible scaling for Skyward (Jon is moving every column to 100 points).
- Direct Skyward integration (still needs district approval, PLAN.md §9).
- AI-written relearning on the fly. Content is written ahead of time, checked and approved.
