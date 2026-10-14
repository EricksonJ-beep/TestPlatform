# Dashboard rebuild plan (Jon, Oct 13 2026)

Jon: "a page that allows me to control and see all of the requests or things that I can monitor
like approving corrections or giving access to a retake… the tabs that show the courses are not
important… a complete gradebook view for the class so I can see who needs to take what without
having to go into each assessment… the recent activity section is good."

## Jon's decisions (these override anything in the research notes below)

1. **Scope:** "Needs you" covers ALL the teacher's courses (every row names course · period). The class
   gradebook follows the sidebar course (course focus) and shows that course's class periods. This
   lifts the Oct 6 parked "per-course dashboard" item for the gradebook only.
2. **Formative scoring (non-CVTC courses):** unchanged cap rule. Attempt 1 at/above the threshold (80):
   the student is directed to do corrections; an approved set lifts the score to 100 (card wording:
   "Do corrections → 100%", not "optional"; no retake offered for them). Below 80: corrections lift to
   80; a retake is needed to go higher and its score stands on its own.
3. **CVTC courses (Anatomy and Physiology):** a COURSE setting `cvtc_rules` ("CVTC rules: corrections
   earn no credit, retakes only"). For every assignment of such a course: corrections give no credit
   (no corrections cap, corrections never "owed" in the gradebook or student card), the only way up
   is a retake (with the teacher's OK where "Retakes need my OK" is on). Settable on the course page;
   set on for the course named "Anatomy and Physiology" by migration/data step.
4. **Also fix:** a capped formative where the card says a retake is available but startAttempt blocks
   it (correctionsClear vs the cap) — the student card and startAttempt must agree with rules 2–3.
5. **Paused tests:** only "Asked to finish" counts in "Needs you". Other paused tests show in the
   class's "Right now" strip and in their gradebook cell with Let them continue.
6. **Projector:** a "Hide scores" switch (hides scores; status tags stay). No separate board view.
7. **Gradebook columns:** every assigned test for the class this term (formative + summative; practice
   off by default), scrolling sideways with the name column and header fixed.
8. **Which period opens:** always the period the teacher picked last (remembered).
9. **Class at a glance:** folded into the summative column footers (Tier 1/2/3 counts, "↑ N this week",
   link to the Tier board). The separate section goes.
10. **Recent activity:** kept, with filters (this class | all classes; by kind; logins off by default).
11. **Removed:** course cards, the four number tiles, Recent results, Class at a glance section.

## Build order (all five ship together in one merge)

1. CVTC course setting + the capped-retake agreement fix (rules 2–4).
2. "Needs you" inbox at the top + header resume code + cleanup of removed sections.
3. One shared "who owes what" rule (`deriveCardState`-style, used by the student card AND the
   teacher gradebook) + a batched class loader (`getClassGradebook(classId)`, ≤ ~12 queries, no writes).
4. The class gradebook on the dashboard: period chips (last picked, remembered), Right now strip,
   who-needs-what chips, grid with cell states/key/filters/footers, cell side panel, student side
   panel, phone list, Hide scores.
5. Live refresh (coarse version stamp, never attempts.updated_at; 15 s poll while visible) + activity
   filters + new log kinds (paused, asked to finish, resumed).

## Research notes (fact-checked synthesis from the design review)

### A) Fact-check

I checked these files directly: `page.tsx`, `queries/dashboard.ts`, `queries/results.ts`, `queries/assignments.ts`, `results/actions.ts`, `results/corrections/*`, `retakes.ts`, `assignments.ts`, `pause.ts`, `attempt-pause.ts`, `student/actions.ts`, `activity-log.ts`, `practice/actions.ts`, `queries/tiers.ts`, `drizzle/0001`, `globals.css` and `docs/decisions.md`.

**Confirmed, as all three designs assume**
- The actions exist and are guarded the way the designs say: `letContinue`, `unlockNextAttempt`, `revokeAttemptUnlock`, `approveCorrections`, `returnCorrections`, `verifyCompletion`, `getResumeCode`.
- `countPendingVerifications` and `countUnmatchedSubmissions` exist and nothing calls them. The second one also counts worksheets that have no owner.
- Stale retake requests can never be cleared. `revokeAttemptUnlock` only deletes rows above the attempts used, and nothing else deletes `attempt_unlocks`.
- `unlockNextAttempt` doesn't check the wait time, the retake window, `closesAt` or the summative gates.
- `getRetakeStatus` writes gate rows during a read (`recomputeGates`).
- The capped-formative mismatch is real. `correctionsClear` doesn't know about the cap, so `startAttempt` blocks a retake that the student card calls optional.
- The `bestAttemptId` rule in `getGradebook` differs from the rule that sets the counting score.
- The student table's "Approve" link opens an attempt page that has no approve button.
- `ui/sheet.tsx`, `use-action.tsx`, `withAuthzRoute`, `requireOwner({type:"class"})`, `classes.period` (free text), `assessments.unitId`, the tier board's 7 s poll with a Live toggle, and `FollowCourse` on `/app/results/[id]` all exist.

**Wrong or incomplete in all three designs**
1. **The `due_at` fix for paused tests is the wrong rule.** The designs suggest `due_at IS NULL OR due_at > now()`. The real rule is `pausePoint` in `src/lib/pause.ts:46`:
   - An idle test is paused unless its deadline came before last activity + 10 min. The suggested check hides a test that really is paused when its deadline passed after it went idle.
   - A test also pauses when its window closes, and today's SQL misses that case too.
   - A paused attempt already has `due_at` = null.
   - **Fix:** work out "paused" in code with `pausePoint` on light attempt rows plus `closesAt`, not in SQL.
2. **Closed tests would lose their correction status.** For a closed test with attempts, `listStudentAssignments` returns the state `"closed"` (`assignments.ts:303`), and `cycleState` never runs. Copying that logic as-is into `deriveCardState` would blank out every past test in the gradebook. But corrections stay open after a test closes: `student/corrections/actions.ts` has no window check, and the "Corrections cap" decision row says so. Retakes can't start once a test is closed (`canStartAttempt` returns `closed`). The teacher version must still work out corrections on closed tests and mark retake states as "closed".
3. **The stale-request filter needs a second check.** "Attempt number = used + 1" isn't enough, because `listRetakeRequests` also ignores `retakesNeedUnlock`. The student card checks both (`assignments.ts:337`), and the Dashboard list should too.

**Design 1**
- "Decline is undoable by unlocking again" is wrong. Unlocking *grants* the retake, which is the opposite decision. Decline deletes the request, and the teacher can't bring it back; only the student can ask again. Decline needs an "are you sure?", not an undo.
- Reusing `CorrectionsQueue` in a side panel is unsafe as written. `queue.tsx:103` listens for A, R, J, K and E on the whole window, so pressing "a" anywhere on the Dashboard would approve a set. It needs a way to turn the keys off. Design 3 has the same problem.
- Adding `revalidatePath("/app")` to `askToFinish` does no harm, but it won't update Jon's open page. `/app` reads cookies, so it is always rendered fresh. Only the poll makes the page live.

**Design 2**
- The live-refresh stamp includes `attempts.updated_at`. The trigger from `drizzle/0001` changes that on every heartbeat and every answer save, so the whole grid would reload every few seconds while a class is testing.
- "This class" activity through `listClassActivity` would mix in other classes. That query filters by enrollment, not by the assignment's class, so it shows what those students did in their other classes too. It also has no `since` option.
- The "parked stat-tile filter strip" (`decisions.md:84`) was parked for the Results student table. Gradebook filter chips aren't the same thing, so this doesn't really need Jon's approval.

**Design 3**
- "`verifyCompletion` needs `/app` revalidation added" is wrong. `practice/actions.ts:36` already calls `revalidatePath("/app")`.
- It has the same keyboard problem from reusing `CorrectionsQueue` as Design 1.
- Its warning about the `updated_at` trap is correct, and its coarse `classVersion` stamp is the right approach.

### B) Scores (1–5; for build effort/risk, 5 = easiest and safest)

| | Meets Jon's asks | Usable in a busy period | Build effort/risk | Correctness/perf | Total |
|---|---|---|---|---|---|
| 1 Inbox-first | 5 | 4 | 4 | 4 | 17 |
| 2 Gradebook-first | 4 (each request list sits behind a chip click) | 3 | 3 | 3 (refresh trap, class leak in the feed) | 13 |
| 3 Class-period mode | 5 | 4 (best ideas for class time, but two tabs and more to learn) | 2 (most surface: two views, auto-pick, Board view) | 4 | 15 |

### C) Recommended Dashboard

The base is Design 1: one page, with the "Needs you" list at the top. Added to it:
- from Design 3: the "Right now" testing strip, the "who needs what" summary chips, picking the period that is testing right now, and the coarse live-refresh stamp;
- from Design 2: clicking a student's name to see everything they owe, and footers on each column.

### Wireframe, top to bottom
```
Good morning, Jon                     Resume code K7Q2MP · good until 10:42 [Show big] [New code]
4 things need you.   [1 asked to finish] [2 retake requests] [1 correction set] [5 answers to grade]

NEEDS YOU  (all courses; every row shows course · period)
  Asked to finish   Ava M · Cell Quiz · A&P 3rd · asked 2 min ago        [Let them continue]
  Retake request    Cal R · try 2 · Skin Quiz · A&P 5th · best 62%
                    "Can start after 2:15"                               [Approve] [Decline]
                    Noah E · "Already took that try"                     [Clear]
  Corrections       Ella F · Mitosis Quiz · 5 answers · 1 flagged        [Review]
  Answers to grade  Unit 3 Test · Bio 2nd · 5 answers from 3 students    [Grade ->]
  Activities        Owen G · Osmosis guided notes                        [Peek] [Check off]
  Worksheet emails  3 to match ->
  (When it is all empty: "Nothing is waiting on you.")

CLASS  Biology: (P1) (P3 *testing now) (P6)  Other classes v              Live *
  RIGHT NOW (only while someone is in a test)
    Testing 14: Eli S 14/25 · 18 min left ...   Paused 2: Gus T [Let them continue] ...
  WHO NEEDS WHAT  [Needs you 3] [Corrections 5] [Sent back 1] [Relearning 2]
                  [Retake needed 4] [Not started 6] [Missing 2]   <- tap one to highlight
  GRADEBOOK  (Formative, Summative; Practice off)  (Open + last 30 days | All)
             [Only students who owe something] [Find student] [Hide scores]
     Student      | Unit 3 Test S | Cell Quiz 2 F | Osmosis F | ...
     Adams, Kya 2 | T2 74 Relearn | 62 Corrections| Not started
     ...
     Footer: done/enrolled · average of counting scores · Tier 1/2/3 counts · up N this week

RECENT ACTIVITY  (This class | All classes)  [Tests][Retakes][Corrections][Practice][Pauses]
  (logins off by default)  9:42 Ava M · P3 · Asked to finish Cell Quiz ...  [Show 3 days]
```
- On a phone, the gradebook becomes one line per student: "Cho, L: 3 to do".
- The grid scrolls sideways inside its own box. The student name column and the header row stay in place.

### Gradebook cells
- **Line 1** is the counting score from `assignment_final_scores`. Summatives show the tier, e.g. "T2 74".
- **Line 2** is one status tag. When more than one applies, the one higher in this list wins.
- **Small marks** can appear in a cell: "2 of 3 tries", a clock with "Retake by Thu" when that is under 48 h away, a tab-switch flag, and "via fixes" when corrections lifted the score.

**Your move (coral). These count in "N things need you."**
1. **Asked to finish:** the test is paused and the student pressed "Ask my teacher".
2. **Retake request:** they asked for their next try on a "Retakes need my OK" test. This only shows for a current request, never a leftover one.
3. **Check corrections:** they sent in corrections that wait for your approval.
4. **To grade (n):** n written answers are waiting for your score.
5. **Check off activity:** a relearning activity is done and waiting for you to check it off.

**Testing now (brand)**
6. **Taking it 12/30:** in the test now and active in the last 10 minutes.
7. **Paused:** stopped by Finish later, 10 minutes idle, or the window closing. They haven't asked to come back yet.

**Student owes (warning)**
8. **Missing:** the test closed and they never started it. Shown bold with an outline. Bloom also has a red "error" colour if Jon wants Missing to stand out more.
9. **Not started:** the test is open and they have no attempt.
10. **Corrections needed 3/8:** they must fix answers first.
11. **Sent back:** you returned their corrections, and they haven't resubmitted.
12. **Relearning (needs: activity, practice):** a summative target is below the line and its checklist isn't done.
13. **Retake needed (LT3, LT4):** the checklist is done but they haven't retaken yet. On a closed test this reads "Retake needed · closed" in grey.

**Your OK, optional (coral outline, not counted)**
14. **Ready, needs your OK:** the retake is ready and they haven't asked. You can unlock it early.

**Quiet (muted)**
15. **Can retake:** an optional retake.
16. **Corrections optional:** a capped formative scored at or above the line; fixing answers lifts it to 100.
17. **Unlocked · after 2:15 / · needs corrections:** you approved, but something else still blocks the start.
18. **Opens Oct 15:** the test isn't open yet.

**Done (success)**
19. **Score with a check:** nothing is left to do.

**Rules for these labels**
- With "Retakes need my OK" on, corrections show as "optional" and are never "owed" (decision row 65).
- Closed tests still show corrections status.

**Filters**
- Who-needs-what chips highlight the matching cells and list the names.
- Type: Formative and Summative on, Practice off.
- Columns: open now + last 30 days, or all.
- Only students who owe something.
- Find a student.
- Sort by name or by most to do.
- Hide scores, for when the screen is projected.

**Clicks**
- **A cell** opens a side panel for that student and test. It has:
  - a plain sentence, e.g. "Took try 1 Oct 9 (62%); corrections 3 of 8 done";
  - the attempt chips;
  - the matching buttons: Let them continue, Approve/Decline, Unlock try N / Take back, Review corrections, Grade;
  - links: Full results, Relearning monitor, View attempt.
  - Delete attempt is never offered here.
- **A student's name** opens their panel with everything they owe in this class, plus a link to their activity log.
- **A column header** opens that test's Results page. Summative headers also link to the Tier board.

### "Needs you" requests
| Request | How Jon clears it | Asks "are you sure?" |
|---|---|---|
| Asked to finish | One click: Let them continue. The resume code is also in the header. | No. It is harmless. If it fails, a message explains why and the page refreshes. |
| Retake request | One click: Approve. A blocker line warns when they still can't start (wait time, retake window, test closed, relearning not done). | Approve: no, there is an Undo (Take back). **Decline: yes**, because the request can't be restored. |
| Leftover request (they already took that try) | One click: Clear | No |
| Corrections to check | Review opens the set in a side panel, then Approve, or Send back with a note | Approve: reading the set in the panel is the check; it can't be undone. Send back needs a note. |
| Answers to grade | "Grade ->" opens the grading queue filtered to that test. Grading inside the panel comes later. | n/a |
| Activity to check off | One click: Check off. Peek shows the student's work. | No, there is an Undo. |
| Worksheet emails to match | Link to the Worksheets page; matching takes two steps there | n/a |
| Paused but hasn't asked (not counted) | Let them continue, from "Right now" or the cell panel | No |
| Ready, needs your OK (not counted) | Unlock try N, from the cell panel | No, there is an Undo (Take back). |

The "N things need you" number equals the rows in this list. Each link opens a page that shows the same items, with no course filter hiding any of them.

### What's removed
- the course cards (and `listCourseCards`);
- all four number tiles (Needs grading, Open tests, Corrections, Classes);
- Recent results, replaced by the column footers, which average the counting score instead of every attempt;
- Class at a glance, folded into the summative column footers and the Tier board link;
- the unused question count.

`getDashboardCounts` and `listRetakeRequests` stay; they get updated rather than deleted, because existing tests use them.

### Open decisions for Jon (one at a time)
1. **Should the class gradebook follow the course picked in the sidebar?** This reopens the parked "per-course dashboard".
   - A) "Needs you" covers all courses and the gradebook follows the sidebar course. **(recommended: nothing gets missed, and the grid stays focused)**
   - B) The whole page follows the sidebar course.
   - C) Everything stays all-courses, with a period picker that lists every class.
2. **A capped formative scored at or above 80, with corrections not finished: can the student retake?**
   - A) Yes. Optional means optional, and corrections stay open. **(recommended: matches the Oct 8 cap rule)**
   - B) No. Corrections must be finished before a retake, and the card should say so.
   - C) Leave it as it is today: the card says optional, but the retake is blocked.
3. **Should a paused test count as "needs you" before the student asks?**
   - A) No. Only "Asked to finish" counts; paused tests show in "Right now". **(recommended)**
   - B) Yes, every paused test counts.
4. **Class at a glance:**
   - A) Fold it into the summative column footers (tier counts and "up N this week") and remove the card. **(recommended)**
   - B) Keep the card as it is.
   - C) Drop it entirely.
5. **Will the Dashboard ever be on the projector?**
   - A) Add a "Hide scores" switch. **(recommended: small)**
   - B) Add a full Board view: first names only, no buttons, big text.
   - C) No, it is never projected.
6. **Which tests appear as columns by default?**
   - A) Open now plus the last 30 days, with "Show all". **(recommended)**
   - B) Everything this term.
   - C) The current unit only.
7. **Which period opens first?**
   - A) The period testing right now, otherwise the one Jon last picked. **(recommended)**
   - B) Always the one Jon last picked.
   - C) Always the first period.

### Build plan
1. **"Needs you" and cleanup** (medium)
   - New:
     - `listPausedAttempts(teacherId)`, using `pausePoint` in code;
     - `listPendingVerifications`;
     - a fixed unmatched-email count;
     - retake requests filtered to current ones (attempt number = used + 1, "Retakes need my OK" on), with a blocker line and a Clear action that calls `requireOwner`;
     - a `?assignment=` filter on the grading and corrections queues;
     - the live resume code in the header.
   - Reused: `letContinue`, `unlockNextAttempt`, `revokeAttemptUnlock`, `verifyCompletion`, `countPendingByAssignment`, `listCorrectionsQueue`.
   - Also: remove the cards, tiles and Recent results, and update the two tests.
   - Done when the header number equals the rows and each one-click action works.
2. **One shared state rule and a batched class loader** (large; nothing visible yet)
   - New:
     - `deriveCardState`, taken out of `listStudentAssignments`. It must still work out corrections when a test is closed.
     - A teacher layer on top: Missing, To grade, Paused/Asked, Request, Ready.
     - `getClassGradebook(classId)`: about 10 queries in 3 waves, with no writes.
   - Reused: `questionsNeedingCorrection`, `correctionsSummary`, `planRetake`, `cycleState`, `pausePoint`, and the stored final scores and gate rows.
   - Done when the student home is unchanged, every open cell matches that student's card, and the loader uses 12 queries or fewer.
3. **Gradebook on the Dashboard** (medium–large)
   - New: period chips, the "Right now" strip, who-needs-what chips, the grid with its key, filters, footers, the cell panel, the student panel and the phone list. Class at a glance is removed. Update decision rows 83 and 90.
   - Reused: `LetContinueButton`, `UnlockButton`, `Sheet`, and the attempt-chip styling.
4. **Live refresh and activity upgrades** (small–medium)
   - New:
     - a `/api/dashboard/version?class=` route built from coarse signals, never `attempts.updated_at`, behind `requireOwner`;
     - a 15 s poll that runs only while the tab is visible and stops after 45 min without use;
     - activity filters for this class and by kind, with logins off;
     - "Started retake (try 2)" lines;
     - new log kinds for paused, asked to finish and resumed;
     - a class filter and a `since` option on `listClassActivity`.
5. **Do it in the panel** (medium)
   - Approve or send back corrections inside the side panel, reusing `CorrectionsQueue` with a new switch that turns its keys off, and inline grading with `GradeForm`.
   - Optionally, store `bestAttemptId` so the "counts" chip always matches the score.