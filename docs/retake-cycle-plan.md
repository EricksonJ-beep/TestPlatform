# Unit-test relearning cycle and custom retakes (Jon, Oct 19 2026)

Jon's ask: "after they get a 50% on the test they should be directed to do corrections on that test
and then once they have the corrections completed that should then unlock a relearning
activity… once they complete those then it should be able to then unlock a retake… the retake
would show up on the teacher dashboard… so then I could kind of approve that… if students got
over an 80% on any learning target then they could choose to retake that… below 80% then we would
want them to do a retake on that… build kind of that custom assessment with the test banks… I
obviously want to maintain… the same integrity of the tests… same point values."

Status: **R1–R4 built (Oct 19 2026)**; Jon approved the plan as written, including the default
answers to the open questions below and the R2 schema shape. R5 is content work. PLAN.md §2, §4
and §10 carry the decisions.

Built notes: R2's shortfall is reported at import and in the builder (each section shows its
retake bank size and any point value it can't cover); the teacher's attempt view does not yet mark
which retake questions were reused originals. R4 also changed the summative attempt default from 1
to 2 (the test plus one retake), since one attempt leaves no retake; existing assignments keep
their number. Migration 0030 turns "Retakes need my OK" on for existing test assignments.

## Jon's decisions (Oct 19 2026)

| #   | Question                                                    | Jon's answer                                                                                                     |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Does the full cycle apply to tests, quizzes, or both?       | **Tests only.** Quizzes keep corrections → retake (with the Oct 14 practice-before-retake rule).                   |
| 2   | The third gate (a practice set) Jon didn't mention?         | **Counts as relearning.** One relearning item per target: an activity *or* a practice set.                        |
| 3   | Corrections and relearning: in order or any order?          | **Strict chain.** Relearning unlocks only after that target's corrections are submitted (approved, if review is on). |
| 4   | Where do the new retake questions come from?                | **A retake bank per test**, held back from practice.                                                              |
| 5   | Does every test retake wait for Jon?                        | **Always.** The request shows in Needs you with the student's targets; Approve opens it through the next school day. |

## What exists today (research, Oct 19 2026)

- Per-target scoring, required (< 80%) vs. optional (≥ 80%) targets, opt-in, the targeted retake
  scope, per-target highest-counts: built (`src/lib/retakes.ts`, `src/lib/gates.ts`,
  `src/lib/grading/score.ts`, `src/lib/assessments/serve.ts`).
- Corrections with auto or teacher-approved review; relearning activities (video, reading, link,
  guided notes, worksheet, interactive); practice sets; teacher pins per assignment: built.
- "Retakes need my OK", student "Ask to retake", the teacher's Needs you list (`src/lib/needs-you.ts`,
  `attempt_unlocks`): built.

**Gap A — imported tests have no target sections.** `src/lib/content-packs.ts` puts every pack
question into one section titled "Questions" with no `learning_target_id`. Per-target scores come
from the *section's* target (`ServedQuestion.learningTargetId`), not the question's tag, so these
tests produce no `attempt_target_scores`, no `retake_gates`, and a scoped retake would serve
nothing. The pack CSVs already carry `learning_target` on every row.

**Gap B — fixed questions repeat.** A scoped retake re-serves a section's fixed questions; only
pool draws give new ones. Pack tests have no pools.

**Gap C — gate rules.** Three gates in any order (`gateOpen`); Jon wants two, in order.

**Gap D — approval.** Test retakes open on their own unless "Retakes need my OK" is on, and the
request row doesn't name the targets.

## Tickets

### R1. Pack tests are built one section per learning target

- `content-packs.ts`: a summative pack creates one section per distinct `learning_target`, in the
  course's target order, titled with the target code and name; questions keep CSV order inside it.
  Rows with no target go to an "Other" section (scored in the total, never retaken) and the import
  summary warns.
- Formative packs unchanged.
- A one-off script re-sections existing summatives **that have no attempts yet**; ones with
  attempts are listed for Jon (see open question 1).
- **Done when:** importing `bio-u2-test-biochemistry` gives one section per U2 target; a test
  attempt writes `attempt_target_scores`; a student under 80% on a target gets a `retake_gates` row.

### R2. Retake bank per test — *schema checkpoint before building*

Proposed shape (for Jon to approve):

- `assessment_sections.retake_pool_id` (nullable) — the pool a retake draws from for that target.
  Attempt 1 serves the section's own items exactly as today; a retake serves from the retake pool
  instead.
- CSV: rows with `pool` = `retake` (any case) in a test pack go into that test's retake pool for
  their target and are **not** placed on attempt 1. The pool is kept out of practice (no
  "open for practice").
- **Mirroring rule** (integrity): for each selected target the retake draws, from unseen questions,
  the same number of questions **at each point value** as the original section (e.g. eight
  1-point + one 4-point matching), and within that the same easy/medium/hard split, reusing
  `dealByDifficulty`. Section points possible on the retake = the original's, always.
- Short pool: the import summary and the builder warn when a target's retake pool can't mirror
  its section (too few questions at a point value). At serve time a shortfall fills from the
  closest difficulty at the same point value, then from the original section's items the student
  missed least recently, and the teacher's attempt view says so.
- **Done when:** a retake on LT4 serves 10 LT4 questions from the retake bank, none seen before,
  same points possible as attempt 1's LT4 section; the test's total points never change.

### R3. Two gates, in order (summatives)

- `gates.ts`: `relearningOk` = a completed tagged (or pinned) activity **or** practice set
  completed after that target's corrections were done; `practice_ok` folds into it (column kept,
  written equal, until a later cleanup migration).
- `gateOpen` for summatives = `correctionsOk && relearningOk`. Formatives untouched.
- Student checklist: relearning shows locked with "Finish your corrections for LT4 first" until
  corrections are OK. CVTC courses: relearning is open at once.
- **Done when:** a student can't credit relearning before corrections; one practice set alone
  clears the relearning step; tests in `src/lib/retakes.test.ts` and `src/app/student/practice.test.ts`
  updated to the new rule.

### R4. Test retakes always wait for Jon

- Summatives behave as if "Retakes need my OK" is on (the setting is hidden on test assignments).
- When every selected target's checklist is done the student card reads **Ask for your retake**;
  asking writes `attempt_unlocks` and an activity-log row.
- Needs you row: "Maya Lopez · Unit 2 Test — retake ready: LT2 · LT3 · LT4", with Approve / Clear.
  Approve opens it through the next school day (the Oct 14 rule) with the scope fixed at what the
  student selected.
- **Done when:** a student who finishes the checklist sees Ask; the request shows on the dashboard
  with targets; Approve lets the scoped retake start; nothing starts without it.

### R5. Relearning content per target (Jon's content work, Claude can help)

- At least one relearning item per learning target per test: a reading that explains the target,
  guided notes, a video, a worksheet, or a practice set.
- Claude drafts readings and guided notes as content packs on request (AI generation inside Bloom
  stays Phase 2).
- The assignment's Relearning page flags targets with no relearning item (today the gate silently
  opens when nothing is published).

Order: R1 → R2 → R3 → R4 (R3 and R4 can swap); R5 runs alongside.

## Open questions for Jon

1. Tests already taken before R1: re-score old attempts per target from the questions' tags so
   those students can enter the cycle, or start the cycle with the next test? (Default: next test.)
2. Retake bank size per target: exactly the section's size, or 1.5× so two students rarely get the
   same retake? (Default: at least 1×, recommend 1.5×.)
3. Should a relearning item done *before* corrections ever count (e.g. a practice set from the
   Practice tab last week)? (Default: no — only after corrections, per decision 3.)
4. Several relearning options per target: student picks any one (default), or Jon pins one?
