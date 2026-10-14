# Student home rebuild: a to-do list (Jon, Oct 14 2026)

Jon's ask: "We should look at this view for a student and rebuild it. Right now for this student
Viola, it says nothing needs her attention right now unless she clicks on my results. We need to
better communicate to the student that they should be working on corrections, a relearning
activity, or something… Even having those as items to do or a to-do list to help them would be
great. Viola should be doing corrections on both of those quizzes and possibly even retakes."

Viola: two closed capped formatives (Unit 2 LT1 Quiz 40%, Unit 2 Quiz: Carbohydrates 50%), no
corrections done. Her home says "Nothing needs your attention right now." Root cause:
`deriveCardState` (src/lib/card-state.ts) returns `closed` ahead of the learning cycle, so owed
corrections on a closed test vanish from the student side while the teacher gradebook still shows
them (`studentKind` in src/lib/class-gradebook.ts reads `cycle`). Research notes:
scratchpad designs (student-first, rules-first, teacher-first) summarised below.

## Jon's decisions (Oct 14 2026)

| #   | Question                                                                      | Jon's answer                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | After a quiz closes, can a student who took it still retake it?               | **Students ask, I approve.** A closed test shows "Ask to retake"; the request lands in the teacher's Needs you; Approve reopens it for that one student.                                                                                                     |
| 2   | How long does an approved reopen last?                                        | **Through tomorrow:** open for that student until the end of the next school day (11:59 PM America/Chicago on the next weekday, Mon–Fri). It ignores the cap's 7-day retake window, since the teacher approved it.                                         |
| 3   | Open tests the student hasn't started: on the to-do list?                     | **Count them too.** They are to-do rows and add to "You have N things to do", matching "Not started" in the gradebook.                                                                                                                                      |
| 4   | "Retakes need my OK" quizzes: corrections under 80% are "optional" today.     | **To-do, then ask.** Corrections are owed exactly as on quizzes without "Retakes need my OK" and must be done before the student can ask for a retake. `correctionsRule` no longer returns `optional`.                                                    |
| 5   | After a quiz, point students to practice on missed targets?                   | **Required before a retake.** Before a quiz retake (or asking for one), the student practises every learning target they missed, like the unit-test relearning checklist.                                                                                 |
| 6   | What counts as "done practicing" a missed target?                             | **Score 80%+ on practice.** A finished practice covering that target, scored 80% or better on that target's questions. Unlimited tries; Build my practice deals new questions each time.                                                                  |

Earlier decisions that still hold: corrections stay open after a test closes and have no due date
(PLAN.md §4, research notes A2); CVTC courses (Anatomy) have no corrections, the retake is the way
up; capped formatives: ≥ 80% → corrections to 100%, no retake; < 80% → corrections lift to 80%,
retake to go higher; "Waiting for your grade" while written answers are ungraded (no partial score,
nothing starts); Finish later rules (tests are finished in Jon's room).

## Rules (one shared rule; the student to-do and the teacher gradebook always agree)

**R1. Closed tests keep their corrections states.** In `deriveCardState`, on a closed test with no
open attempt and nothing waiting for a grade, a corrections cycle (`corrections_needed`,
`corrections_to_full`, `corrections_returned`, `corrections_submitted`) wins over `closed`. Other
closed states stay `closed` unless R6 applies. Reverses decisions.md rows 85/93 ("the student's
card still reads Closed"); update those rows.

**R2. No more "optional" corrections.** `correctionsRule` (src/lib/retakes.ts) drops the
`optional` branch: with "Retakes need my OK" on, corrections are `gate` / `to_full` exactly as
without it (CVTC stays `none`). A retake request (`requestRetake`) is refused until corrections are
clear (and, for quizzes, practice is done, R3); the teacher's unlock still decides after that.
Update startAttempt, cycleState, the gradebook, the Needs you inbox and every test that pinned
`optional`. Corrections on attempt 1 of a capped quiz still lift the score as before.

**R3. Quiz relearning: practice before a retake (formatives).** After corrections are clear on a
formative, every learning target scoring under the assignment's retake threshold (default 80%) on
the **latest finished attempt** (`attempt_target_scores`) needs practice:
- Done when the student has a **finished** practice attempt, **completed after that quiz attempt
  was submitted**, in which that target's questions scored **≥ 80%** (earned / possible on items
  tagged to that target), and that practice covered the target with **at least 5 questions**, or
  was a teacher-published practice set tagged to the target (any size).
- Practice that counts: a published practice set tagged to the target (`practice_set_targets`),
  or a student-built practice (Build my practice, `practice_attempts.target_ids`) whose served
  questions include the target.
- No practice content exists for a target (no published set tagged to it and no open-practice bank
  question tagged to it) → that target does not block (same principle as the unit-test gates).
- Untagged quiz questions don't create targets; a quiz with no tagged targets has no practice step.
- Applies in every course, CVTC included, on open tests and before "Ask to retake" on closed ones.
- Not for `to_full` (no retake there) and not for summatives (they keep their gate rows).
- Card/cycle: formative with corrections clear and practice owed → `relearning` (the same state
  summatives use); the gradebook tag reads "Relearning (needs: practice LT…)". `startAttempt` and
  `requestRetake` refuse with a clear message naming the targets.
- Pure rule in a lib module (e.g. `quizPracticeNeeds`), DB read in a query module; the student
  home, startAttempt, requestRetake and the gradebook loader all call the same rule. Batched in the
  gradebook loader (no per-cell queries).

**R4. Ask to retake on a closed test (decisions 1–2).** A student may ask for the next attempt on a
**closed** assignment (formative or summative) when: attempts remain, nothing is open or waiting
for a grade, corrections are clear (R2), quiz practice is done (R3) / summative gates are open,
and they have not already asked. This uses the existing `attempt_unlocks` request row
(`requestedAt`, `grantedAt`) whether or not "Retakes need my OK" is on. New column
`attempt_unlocks.open_until timestamptz null` (migration 0028, re-runnable: preview builds share
the live database). The teacher approves in Needs you (existing Retake requests group): Approve on
a closed assignment sets `granted_at = now`, `open_until = endOfNextSchoolDay(now)` (pure helper:
next Mon–Fri after today, 23:59 America/Chicago). Decline / Undo / Clear work as today.
Jon, Oct 14 2026: "Let them ask while it's still open too": past the cap's 7-day retake window on
a quiz still open, a ready retake reads Ask to retake too, and Approve gives it the same
`open_until` (the window doesn't apply until then); see decisions.md, "Ask while open".

**R5. Effective close per student.** One helper gives a student's close for an assignment: the
later of `assignments.closes_at` and an unused granted unlock's `open_until` for attempt used+1.
Every place that reads `closes_at` for a student uses it: `assignmentStatus` inputs in
`deriveCardState` (student home and gradebook loader), `canStartAttempt`/`startAttempt`,
`createAttempt` (the deadline is capped at the close: must use the effective close or a reopened
retake starts already past due), `settleAttempt`/`pausePoint` (window-close pause), `saveAnswer`
writability, the student assignment page, `requestRetake`. While reopened, the cap's retake window
does not apply to that student's retake (decision 2).

**R6. Retake states on closed tests.** On a closed test with attempts left, prerequisites done and
no request yet, the student card state is a new `ask_to_retake`. It is a counted To do row when the
retake would be `retake_required` if the test were open (a summative with required targets);
otherwise (an optional retake, e.g. a capped quiz lifted to 80% by corrections) it sits in "Want a
higher score?". After asking: `awaiting_unlock` with `retakeRequested` ("Waiting on your
teacher"). After approval the test is open for that student (R5) → the normal `retake_required` /
`retake_available`. The gradebook shows a closed-test request as "Retake request" (your move).

## Student home (src/app/student/page.tsx)

Top to bottom:
1. **Greeting + count:** "Hi, Viola" and "You have N things to do." / "You're all caught up." N
   equals the counted To do rows (one builder; delete the two disagreeing lists in page.tsx and
   `NEEDS_YOU`).
2. Password nudge (unchanged).
3. **To do** (always visible, above the tabs; a list, not a spotlight card: Jon declined "Up next"
   Oct 8). Counted rows, in this order:
   - Keep going: an open attempt (paused → "Finish it in class", still counted).
   - Sent back corrections (reviewer note shown).
   - Corrections (open or closed): "Correct 6 missed questions to raise your score from 40% to
     80%." with "0 of 6 done", [Do corrections]/[Continue corrections]. Wording from the rule:
     to_full "from 85% to 100%… there's no retake at your score"; capped attempt-1 set "from X% to
     80%"; otherwise "to unlock attempt N" or, closed, "before you can ask to retake".
   - Practice (R3): "Practice U2.LT1: score 80% to unlock your retake (you scored 40%)."
     [Practice] → Build my practice preselected on that course/unit/target (add a `target`
     search param to /student/practice/build). Shows best practice so far if any.
   - Relearning checklist (summatives): corrections ✓ · activity ✗ · practice ✗ per target.
   - Retake required: [Start retake] (or "You can start after …" with no button during a wait).
   - Ask to retake on a closed test when the retake is required (R6): [Ask to retake].
   - Open now (not started): "Closes {date} · 20 min · code from your teacher" [Start].
4. **Want a higher score?** (not counted): optional retakes (`retake_available`), "Ask for a
   retake" on open tests with "Retakes need my OK", and optional Ask to retake on closed tests (R6).
5. **Waiting on your teacher** (not counted): waiting for your grade; corrections submitted (being
   checked); retake requested (open or closed); activity waiting for check-off.
6. **Tabs** (URL `?tab=` so rows can deep-link; Back works): Assessments | Practice | My results.
   - Assessments grouped by status: Open now, Opens soon, Closed (newest first, collapsed "Show
     closed · n", with "· k have corrections to do" when k > 0). Cards keep their real pill and
     button (a closed quiz with corrections shows "Do corrections").
   - Practice: "Needed before your retake" lists open or reopened tests only, plus the quiz
     practice targets (R3).
   - My results: corrections label follows the rule wording; fix the "?" target chips on
     formatives (student-results.ts: formative attempt-target ids are not in `allIds`).
7. Class chips and "Join a class" move below the tabs.

Phone: 16px gutter, rows stack (title, why line, progress, full-width h-11 button below `sm`),
no horizontal scroll at 320px. Each button has an aria-label naming the test. `data-todo-group` /
`data-todo-kind` hooks for tests. The page makes no writes (View as student works).

Copy fixes: no "Retake by" / "Next attempt" / "then retake it to go higher" on closed tests unless
reopened; the assignment page shows Ask to retake / the request state on closed tests.

## Teacher side

- Needs you → Retake requests: rows for closed tests read "Closed · approving reopens it for
  {name} through {date}"; Approve sets `open_until` (R4). The blocker line shows practice still
  owed (R3) as for summative gates.
- Gradebook: formative relearning tag "Relearning (needs: practice U2.LT1)"; a closed-test request
  shows "Retake request" (your move); a reopened student shows "Reopened through {date}" in the
  cell sentence; the student panel lists the same to-do the student sees.
- `getClassGradebook` stays batched (no per-cell queries) and read-only.

## Build steps (commit after each green "Done when")

1. **Rules:** R1, R2, R3 (pure rule + batched query + enforcement in startAttempt/requestRetake +
   card/gradebook), tests. Done when a Viola fixture (two closed capped quizzes 40%/50%) reads
   `corrections_needed` on both; after corrections, `relearning` with practice owed; after an
   80% built practice on the target, the next state; and every gradebook cell equals the
   student's card.
2. **Reopen:** R4–R6, migration 0028, effective close everywhere, Needs you approve with the date,
   tests (approve → student can start, deadline not in the past, Finish later pause uses the
   reopened close, the reopen ends after the date, cap window ignored while reopened).
3. **Student home UI:** to-do builder (pure, tested), the page, URL tabs, status-grouped
   Assessments tab, Build-my-practice target deep link, My results fixes, copy fixes, phone.
4. **Teacher touches + docs:** inbox/gradebook wording, decisions.md rows (reverse 85/93, new rows
   for decisions 1–6), PLAN.md §5 screen 2.

## Not building (parked or out of scope)

Notifications/email, streaks/gamification, per-student due dates for corrections, a spotlight
"Up next" card, deleting attempts.
