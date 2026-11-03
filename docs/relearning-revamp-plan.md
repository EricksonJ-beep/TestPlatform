# Relearning revamp: a shorter, clearer path to the retake (Jon, Nov 2–3 2026)

**Status: proposed. Waiting on Jon's review. Nothing below is built yet.**

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
```

## Jon's decisions (Nov 2–3 2026)

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

## Rules

### Quiz (formative) rules: replace the corrections cap and quiz-practice rules

- **Q1. Below the threshold (default 80%).** The path is Corrections → Relearn → Practice check.
  Each step opens when the one before it is done. Corrections done alone raises nothing (this
  replaces `correctionsCeiling`'s "lifts to the threshold" for corrections alone). When the
  practice check passes, the counting score becomes the threshold automatically, with basis
  `relearning_path` (new `FinalBasis`). The retake then unlocks. It serves the same number of
  questions, its score stands on its own, the highest score counts, and the attempt limit and
  7-day retake window are unchanged.
- **Q2. At or above the threshold.** Corrections done → counting score = max(attempt 1, 90),
  basis `corrections_to_90`. Corrections + relearning + practice check → 100, basis
  `relearning_path`. No retake. A 100% has nothing to correct and nothing to do.
- **Q3. One stitched activity.** The quiz's relearning is one Read, Watch or Do made of that
  option's sections for the quiz's targets that were below the threshold, or all of the quiz's
  targets with a missed question under Q2. Aim for about 10 min in total: about 10 min for one
  target, about 5 per section for two or three.
- **Q4. The practice check covers those same targets**: 5 questions in total, split evenly with
  the extra going to the weakest. 4/5 passes.
- **Q5. Teacher-approved corrections** keep working: on those assignments, Relearn opens only
  after Jon approves the corrections.

### Test (summative) rules: replace the three-gate checklist

- **S1. Required targets** are the targets below 80% on attempt 1. Corrections only on their
  missed questions. Unchanged.
- **S2. Per target:** Corrections ✓ → Relearn (pick Read, Watch or Do for this target, about
  10–15 min) ✓ → Practice check (5 on this target, 4/5) ✓. Targets move through the path
  independently; LT2 can be ready while LT4 is still practicing.
- **S3. Retake unlocks** when every required target has passed its practice check. The picker
  offers **Full test** (every target) or **Custom** (required targets locked in, targets at 80% or
  higher are tick boxes). An optional target the student adds needs no path of its own; they've
  already shown 80%.
- **S4. Scoring:** unchanged. Highest per target, combined into one test score.
- **S5. No partial credit** along the way on a test. The path unlocks the retake and the
  retake earns the score.

### Practice check rules (both)

- **P1. Dealing:** from the target's **Practice bank(s)** only (`bank-kinds.ts` kind `practice`),
  auto-graded types only (no `short_answer`, no written answer). Each deal holds 3 easy, 1 medium
  and 1 hard, unseen questions first. If a band runs short, Bloom borrows from the next band and
  flags the bank as thin on the teacher's side.
- **P2. Answering:** one answer per question, then right/wrong and the explanation. No retry and
  no hint inside the check. Score = first answers correct.
- **P3. Below 4/5:** a **Look back** screen lists the missed questions with their explanations
  and a "Reopen my relearning" link. Its **Try a new 5** button deals a fresh hand. Unlimited
  rounds. The relearning monitor shows every round.
- **P4. Teacher setting:** pass mark per assignment, default 4 of 5. Size fixed at 5.

### Relearning activity rules (both)

- **A1. Three modes per target:** **Read** (short reading with an analogy, worked examples, and
  1–2 quick checks per section), **Watch** (a video, YouTube or Jon's own, with quick checks at
  set timestamps; the video pauses until the check is answered), **Do** (drag-and-drop
  labeling/sorting/matching, a flashcard set ending in a short self-quiz, or step-by-step worked
  problems that reveal one step at a time, chosen per target).
- **A2. Credit:** every quick check answered correctly (unlimited tries, so no one gets stuck),
  plus the one short answer if that section has one. Read also needs the reading scrolled to
  the end; Watch also needs 90% of the video watched.
- **A3. Choice:** the student can switch modes until they finish one. After that it's locked
  for that target or quiz.
- **A4. Fallback:** if a target has only one or two modes built, the student sees what exists.
  If it has none, the step shows "Your teacher will give you a relearning activity," and Jon can
  check it off from the relearning monitor (as `activity_completions.teacher_verified` does
  today).

### Gradebook and Skyward rules

- **G1. History everywhere:** each score shows its trail, e.g. **40 → 80 (path)** or
  **40 → 80 → 95 (retake)**. Hovering or tapping lists each step and its date. This appears in
  the class gradebook cell, the results table and the student's My results.
- **K1. One Skyward file per Skyward assignment.** Columns: **Last Name, First Name, Other ID,
  Score**, with Score a **percent** (whole number, rounded half up).
  - Quiz: one file per learning target on the quiz, each with that target's percent. File name
    follows Jon's columns, e.g. `F_LT3U2.csv`.
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
- **Tests** show one compact path per required target, stacked, with a "Retake ready when all
  are ✓" footer.
- **The end of a quiz path** shows two big choices side by side: **Keep my 80%** (which just
  marks the path done) or **Take the retake**.
- **Where it shows:** the home To do rows (a mini path), the assessment card (a mini path in
  place of the status pill text) and the assessment page (the full path). It uses the same
  shared rule as the teacher gradebook, so they always agree.
- **Relearn picker:** three big cards, **Read 📖 · Watch 🎬 · Do 🧩**, each with a one-line
  description and "About N min."
- **Phone / Chromebook:** the path becomes a vertical list, with the Next step box first.

## Teacher side

- **Relearning monitor and tier board** get the new stages: corrections → relearning (mode,
  progress) → practice (rounds, best) → ready → retake.
- **Activity builder:** per target, a Read / Watch / Do slot, each built from sections. A section
  holds rich text or a video URL with timestamps, its quick checks, and an optional short answer.
  Content packs can load all three.
- **Bank health:** on Question banks, each Practice bank shows its count by difficulty and type,
  flagged when a band can't fill a deal.

## Build tickets (commit after each green "Done when")

Order: platform first (R1–R8), then content (C1–C4). Each ticket stops at its "Done when."

### R0 · Spec updates
Update PLAN.md (§2 attempt table, §3.7, §4 steps 2–5 and rules, §9 Skyward, §10 student screens)
and docs/decisions.md with the decisions above. Mark the replaced rows (Retake gates, Practice
checking, Corrections cap, Student to-do rules R3) as superseded.
**Done when** PLAN.md and decisions.md match this plan and Jon has read them.

### R1 · Schema
- New table `relearning_paths` (student, assignment, target or null for a quiz's stitched
  activity, mode, status, started/finished).
- New table `relearning_sections` (activity, target, mode, order, content, checks JSONB,
  short-answer prompt, est. minutes).
- New tables `practice_checks` and `practice_check_rounds` (student, assignment, targets, served
  question ids, answers, score, passed).
- New `FinalBasis` values `relearning_path` and `corrections_to_90`.
- `assignments.practice_pass` (default 4).

Migration only; the old gate tables stay readable for history.
**Done when** `drizzle-kit generate` is clean, the migration applies to a Neon branch and the
existing tests pass.

### R2 · The rule (pure functions + tests)
- New `src/lib/relearning-path.ts`: `pathFor({ type, threshold, attempt1PerTarget, corrections,
  relearning, practice })` → steps, current step, locked reasons and the counting score per Q1–Q5
  and S1–S5.
- Wire it into `deriveCardState`, `assertRetakePrerequisites`, `cycleState`, `gates.ts`, the
  class gradebook and Needs you. That retires `PRACTICE_PASS_PERCENT` in `quiz-practice.ts` and
  `correctionsCeiling`'s corrections-only lift for this flow.

**Done when** unit tests cover:
- 40% quiz: no lift after corrections alone, 80 after the path, then retake to 95.
- 85% quiz → 90 → 100.
- 100% quiz: nothing to do.
- Test with LT2 and LT4 below: per-target progress, retake locked until both pass, custom
  picker lists.
- Teacher-approved corrections.
- CVTC course unchanged.

### R3 · Practice check
- Dealer (P1): Practice banks, auto-graded only, 3E/1M/1H, unseen first, band borrowing.
- Runner (P2): first try counts, then explanation.
- Look back screen and Try a new 5 (P3).
- Results feed R2.

**Done when** a student can fail a check, see the Look back, pass a fresh 5, and the path and
counting score update; plus tests for the dealer's split (1 target: 5; 2 targets: 3 + 2 to the
weaker; 3 targets: 2 + 2 + 1) and band borrowing.

### R4 · Relearning activities: Read · Watch · Do
- Section renderer for Read (rich text plus inline checks) and Watch (YouTube IFrame API: pause
  at timestamps, show the check, resume; 90% watched).
- Do: reuse `interactive` drag-and-drop pages; new **flashcards** (flip deck plus a 3-card
  self-quiz) and **worked steps** (reveal one step at a time, a check after each).
- Picker (A3), stitching for quizzes (Q3), fallback (A4), and the activity builder plus
  content-pack support.

**Done when** one Physical Science target has all three modes working end to end, and a quiz
on two targets stitches into one activity.

### R5 · Step path UI
StepPath component, Next step box, Relearn picker, test per-target stack, quiz end choice (Keep my
80% / Take the retake), and placement on home, cards and the assessment page. Phone layout.
**Done when** Jon walks a test student through a 40% quiz and a two-target test on a Chromebook
and a phone without help text, and the student's path matches the teacher gradebook cell at
every step.

### R6 · Retake picker for tests
Full test or Custom (S3), using `planRetake`'s required/optional split.
**Done when** a student with LT2 and LT4 below 80% can pick Full or Custom (LT2 + LT4, plus an
optional LT1), and the retake serves the right sections from each target's pool.

### R7 · Gradebook history
The score trail (G1) in the class gradebook cell, results table, student results page and My
results; live refresh unchanged.
**Done when** a 40 → 80 → 95 student shows that trail in all four places, each step dated.

### R8 · Skyward export
- New export (K1, K2): per-target files for quizzes, one file for tests, zip plus single-file
  buttons, Skyward-style file names (editable before download), and the "No Skyward ID" list.
- Keep the old CSV as "Detailed CSV."

**Done when** Jon imports one quiz-target file and one test file into Skyward and every student
matches.

### C1 · Physical Science Practice banks to about 100 per target
- 25 targets, today about 50 each (docs/ps-practice-banks-plan.md), so about 1,275 new
  questions, from Jon's Drive materials.
- Mix weighted toward easy, since every check draws 3 easy: about **45 easy · 30 medium · 25
  hard**.
- All auto-graded: numeric for math targets, multiple choice / matching / fill-in for concepts.
- Same self-check (every key verified, every number recomputed) and spot-check review as before.

Delivered in packs, one unit at a time.
**Done when** every PS target's Practice bank has about 100 live auto-graded questions and its
bank health shows no thin band.

### C2 · Physical Science Read · Watch · Do (25 targets)
- **Read:** the existing reteach readings, trimmed to about 10 min and given inline checks.
- **Watch:** suggested videos with timestamps and checks, sent to Jon to approve or swap.
- **Do:** per target, varied (drag-and-drop, flashcards, worked steps).

**Done when** every PS target has all three modes and Jon has approved the video list.

### C3 · Biology Practice banks (33 targets × about 100)
- Biology has Retake banks but no Practice banks, so this is about 3,300 new questions from
  Jon's Drive materials.
- Same mix and checks as C1, one unit at a time, starting with the unit Jon is teaching next.

**Done when** each Biology unit's targets have about 100-question Practice banks, unit by unit.

### C4 · Biology Read · Watch · Do (33 targets)
Same as C2.
**Done when** every Biology target has all three modes.

## Questions to settle before R2 (Claude's best guess in brackets)

1. **Quiz with several targets and Skyward per-target columns.** Example: a quiz on LT1–LT3
   where a student scores 40% on LT1 and 90% on LT2 and LT3. Is the 80% / 90% / 100% lift worked
   out **per target** (LT1 → 80 after its path; LT2 and LT3 → 90 after corrections) or on the
   **whole quiz**? [Per target, since that's how the scores go into Skyward. Most Physical
   Science quizzes are one target anyway.]
2. **Students already partway through** the old cycle when this ships. [Finish on the old rules
   for assignments already taken; the new path starts with the next assignment.]
3. **Skyward header row.** Does the import expect a header line (Last Name, First Name, ID)?
   [Include it, and confirm with Jon's first test import.]
4. **"Keep my 80%"**: is it a real choice that closes the retake, or just "done for now" with
   the retake still open until the window closes? [Done for now; the retake stays available.]

## Not building (parked or out of scope)

- Anatomy & Physiology (CVTC rules stay as they are).
- Points-possible scaling for Skyward (Jon is moving every column to 100 points).
- Direct Skyward integration (still needs district approval, PLAN.md §9).
- AI-written relearning on the fly. Content is written ahead of time, checked and approved.
