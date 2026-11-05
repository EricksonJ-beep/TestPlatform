# Assessment settings on the new relearning path: a brainstorm

*For Jon, Nov 5 2026. Read-only research: nothing in Bloom was changed. Sources: `docs/relearning-revamp-plan.md` (decisions 1–37), PLAN.md §2 and §4, and the code cited as file:line.*

---

## The short version

- The assign dialog still describes the **old rules**. On a path course, the path runs things, and **4 of its 15 settings now do something different from what their help text says** (corrections cap, retake window, retakes need my OK, threshold).
- **3 settings do nothing on a quiz** (optional retakes, Tier 2, and the retake window on a test), but they still show.
- **1 setting the spec says you control has no screen**: the practice-check pass mark (4 of 5). It's stored and used, but you can't change it.
- **The biggest surprise:** a new **test** gets **1 attempt** by default. A student can finish the whole path and then see "No retakes left."
- **My recommendation (Proposal A):** two presets, **Quiz** and **Test**, with the path defaults built in, a plain-English "What students will do" line, and an **Advanced** fold for the rest.

**An analogy.** The old settings were a manual transmission: you set the clutch (corrections cap), the gears (threshold, window) and the brake (retakes need my OK) yourself. The path is an automatic transmission. The gear stick is still on the dashboard, though. Some positions do nothing now, some quietly change how the automatic drives, and the labels still describe the manual.

---

## 1. Where settings live today

| Place | Who sees it | What it sets |
| --- | --- | --- |
| **Assessment → Settings** (`src/app/app/assessments/[assessmentId]/settings-sheet.tsx`) | The assessment builder | Defaults copied into each **new** assignment, plus delivery options. Changing them later does **not** change existing assignments (sheet text, line 84). |
| **Assign → New assignment / Edit** (`src/app/app/assign/assignment-dialog.tsx`) | One assignment per class | Window, access, attempts, retakes, corrections. **This is the screen that matters.** |
| **Course page** (`src/app/app/courses/[courseId]/`) | Once per course | CVTC rules and **New relearning path from [date]** |
| **Question banks** (column on the banks page) | Per bank | Whether a bank is a **Practice** bank, which decides what the practice check can deal |

**When the path applies** (`src/lib/relearning-path.ts:27-40`, `src/lib/queries/relearning-path.ts:74, 222-223`): a quiz or test whose **attempt 1 is turned in on or after** the course's switch date, in a course **without** CVTC rules, **and only if attempt 1 had learning targets**. A quiz with no targets keeps the old rules, without saying so.

---

## 2. Today's settings: old rules vs the path

"Old rules" means v2, which still covers assignments taken before launch and Anatomy.

### 2a. The assign dialog (per class)

| Teacher sees | Old rules | On the path | Default |
| --- | --- | --- | --- |
| **Opens / Closes** (dialog 205-232; schema.ts:676-677) | The window for starting attempts. Corrections stay open after the close; a retake after the close is "Ask to retake". | Same window for attempts. **The path stays open with no deadline** (Q8, S6). A finished path on a closed quiz or test shows **Ask to retake**, and your Approve reopens it until the end of the next school day. | Blank (open until you close it) |
| **Access code** (dialog 238-261; schema.ts:678) | A code is needed to start any attempt. | Same. Retakes need the code too. | None |
| **Time limit (minutes)** (dialog 262-274; schema.ts:679) | Enforced on the server, then auto-submits. | Same. It doesn't touch relearning or checks. | None |
| **Attempts allowed** (dialog 283-296; schema.ts:681) | The total number of attempts. | Same cap. **Attempt 3** also needs a fresh 4/5 check on any target still below the line after the retake (Q6; relearning-path.ts:378-396). | Quiz **3**. Test **1** (`src/lib/assignments.ts:211-214`; `assessments/actions.ts:108`). PLAN.md §2 says tests are "1 + 1 retake". |
| **Retake threshold %** (dialog 297-310; schema.ts:683) | Below it: corrections required, and a quiz is raised to the threshold by corrections. On a test, below it means "Must retake". | It now sets **three things at once**: (1) which targets are required, (2) **what a required quiz target is raised to** once its path is done (relearning-path.ts:311-313: the raise *is* the threshold, not a fixed 80), and (3) the line for attempt 3's check. The **90% for corrections is fixed** in code (`CORRECTIONS_RAISE`, relearning-path.ts:16). | 80 |
| **Corrections review: Auto / Teacher approved** (dialog 313-325; schema.ts:682) | Auto: corrections count as approved when submitted (`src/app/student/corrections/actions.ts:145`). Teacher approved: you approve before the gate opens. | Auto: same. Teacher approved: **relearning and the check open on submit**; only the raise and the retake wait for your OK. Corrections sent back don't undo relearning (Q7). | From the assessment. New assessments are created **Teacher approved** (`assessments/actions.ts:109`). |
| **Tier 2 up to (targets below)** (dialog 326-337; schema.ts:686) | Tests only: tier board columns. | Unchanged, and still tests only. **Does nothing on a quiz** (`src/lib/queries/tiers.ts:163`). | 2 |
| **Wait between attempts (hours)** (dialog 339-354; schema.ts:689) | Hours after a submission before the next attempt (`assignments.ts:89-92`). | Same, on top of the path. Counts from the last submission, so it can still block a student who just passed the check. | 0 |
| **Retakes need my OK** (dialog 355-361; schema.ts:694) | After corrections (and quiz practice), the student **asks** and you unlock. | After the **whole path**, the student asks and you unlock. With Teacher-approved corrections, that's **two OKs** from you per retake. The help text still says "on a quiz, practice the targets they missed" and "corrections are the way to 100%", which is old wording. | Off |
| **Corrections cap (formatives)** (dialog 362-368; schema.ts:700) | Below the line: corrections required and raise the quiz to the threshold. At or above: corrections → 100%, no retake. | **Its meaning changes completely.** On a path quiz it is the **"path raises scores"** switch (`queries/relearning-path.ts:251`; relearning-path.ts:127-131). On: 80/90/100 raises, Keep my 80%, and the retake window. Off: **no raises at all**, no "80% earned" step, no Keep my 80%, no retake window. The path only unlocks the retake, like a test. **Corrections alone never raise a required target on the path**, which the help text contradicts. Tests ignore it. | On |
| **Retake window (days after the first attempt)** (dialog 369-386; schema.ts:702) | Quizzes under the cap: retakes must start within N days of attempt 1; after that the student asks. | Same rule, still counted from **attempt 1**. The time the path takes, including waiting for your approval, **comes out of the window** (decision 28: "the retake stays available until the retake window closes"). Applies to **quizzes with the cap on only** (`src/app/student/actions.ts:233-236`). **Tests silently ignore it**, though the box shows. | 7 |
| **Allow optional retakes** (dialog 387-392; schema.ts:684) | Tests: targets at or above the line may be opted into; each needs corrections, an activity and a practice set (`gates.ts:95`). | Tests: turns the **Full test / Custom** picker on or off (R6). An added target needs **corrections only** (decision 29). Off: the retake covers required targets only. **Does nothing on a quiz** (`src/lib/queries/retakes.ts:19`). | On |
| **Show results to students right after submitting** (dialog 393-400; schema.ts:687) | Hides scores until you release them. | Same for scores. **Worth a test:** the step path is built without checking it (`student/assignments/[assignmentId]/page.tsx:94-108`), and its tick boxes print percents ("Fix my mistakes on LT2 (85%)", `src/app/student/path/optional-targets.tsx:37`). Held results may show through the path. | From the assessment (on) |
| **Practice check pass mark** (schema.ts:704) | (none) | **Used**: the check passes at it (`practice-check.ts:195-204`), the student's words quote it (relearning-path.ts:656, 660), and each check stores the mark it started with. **No screen sets it**: it's missing from the dialog and from the action's schema (`src/app/app/assign/actions.ts:35-69`). P4 and PLAN §4 say it's a per-assignment setting. | 4 (of 5; the size of 5 is fixed) |

### 2b. Elsewhere

| Teacher sees | Old rules | On the path | Default |
| --- | --- | --- | --- |
| **Relearning** button → pins page (assignments-table.tsx:141-149; `/app/assign/[id]/relearning`) | Tests: pin the exact activity or practice set a target's gate requires. | **Ignored.** On the path, the gate flags come from the path (`src/lib/gates.ts:69-83`). The button still shows on every test. | No pins |
| **Assessment → Attempt limit** (settings-sheet 124-134; schema.ts:587) | Default for new assignments. | Same. | Quiz 3, test 1, practice unlimited |
| **Assessment → Corrections review** (settings-sheet 151-163) | The option reads "Auto: submitting corrections unlocks the retake." | That's **no longer true**: auto approves the corrections, but the retake still needs relearning and the check. | Teacher approved |
| **Assessment → Threshold, Optional retakes** (settings-sheet 137-169) | Defaults for new assignments. | Same as in the dialog above. | 80 / on |
| **Assessment → Delivery** (randomize questions/answers, one at a time, going back, show results; schema.ts:591-595) | How attempts look. | Unchanged. The practice check has its own fixed rules (P2). | Shuffle on, one at a time on, going back on |
| **Test section → retake pool and draw count** (schema.ts:624-627) | A targeted retake draws fresh questions from the section's pool. | Unchanged (R6). | None; packs default to 10 |
| **Course → CVTC rules** (schema.ts:155) | Corrections earn nothing and are never owed; the only way up is a retake. | **Overrides the path.** A CVTC course never uses it (relearning-path.ts:35). | Off |
| **Course → New relearning path from [date]** (schema.ts:162) | (none) | The switch. Only an attempt 1 turned in after it uses the path; past dates are refused (`src/lib/relearning-switch.ts`). | Off |
| **Bank → column (Practice / Quiz / Test / Retake)** (schema.ts:337) | Only sorts the banks page. | **Decides which questions the practice check can deal** (`src/lib/practice-check-server.ts:59`). Dragging a bank into the Practice column makes its questions check material. | Read from the bank's name |
| **Bank → Open for practice** (schema.ts:331) | Feeds "Build my practice". | Unchanged, and **not** used by the check. Two separate "practice" switches on one bank. | Off |
| **Content-pack `assign` block** (`src/lib/content-packs.ts:493-499`) | Sets attempts (3 if omitted, **even for a test**), wait and unlock. | Same. Everything else falls to schema defaults. | 3 / 0 / off |

---

## 3. What becomes redundant, confusing or conflicting

### 3.1 The corrections cap is now a hidden "path raises scores" switch (conflicting)
- **Today's help text:** "finishing [corrections] brings the score up to the threshold."
- **On the path:** corrections alone raise a required target by **nothing**. The 80% comes only after Relearn and the 4/5 check.
- **Turning it off** removes the 80/90/100 raises, Keep my 80%, the "80% earned" circle and the retake window. A path quiz then behaves like a test. Nothing on screen says so.
- **Surprise example:** a teacher reads the help text, tells a 40% student "do your corrections and you'll be at 80," and the gradebook still says 40. Or the teacher unticks the cap ("I don't want to cap corrections") and every student's path ends with no raised score.

### 3.2 The threshold moves the raise, and the 90 doesn't move with it (confusing)
- The threshold is the "required" line, the amount of the raise and the attempt-3 line, all at once. The corrections raise is **fixed at 90**.
- **Surprise example, threshold set to 70:** a student at 65% does corrections, relearning and the check, and is raised to **70**. A student at 75% does corrections only and gets **90**.
- **The same cliff exists at the default of 80:** 79% does the whole path for 80, while 80% does corrections alone for 90. That's decisions 17–18 as approved. It's worth knowing before a parent spots it.

### 3.3 The retake window ticks while the path runs (conflicting)
- The 7 days count from **attempt 1's turn-in**, not from when the path is done.
- **Surprise example:** a quiz is taken Monday Nov 2, and the window closes Monday Nov 9. The student is absent Tue–Thu, submits corrections Friday, and does relearning and the check the next Monday. In teacher-approved mode, Jon approves Tuesday the 10th. The 80% lands, but the window shut on the 9th, so "Take the retake" has become "Ask to retake." The student did nothing wrong.
- The window **doesn't apply to tests at all**, though the box shows on a test.

### 3.4 Two OKs per retake (redundant)
- With **Teacher-approved corrections** and **Retakes need my OK** both on, you approve the corrections and then approve the retake as well. The path already makes sure the work is done.
- **Surprise example:** the student finishes everything Thursday and sees "Waiting on your teacher." You think you approved them already. You did, but only the corrections.

### 3.5 A new test has only one attempt (conflicting)
- New tests default to **1 attempt** (code, Sept 28). PLAN.md §2 says "1 + 1 retake".
- On the path, a test student still goes through corrections, relearning and a check for every required target. Then the Retake circle reads **"No retakes left"** (`src/lib/step-path.ts:208`).
- **Surprise example:** a Biology test is assigned with defaults, LT4 comes in at 60%, and the student does 15 minutes of relearning plus a check for nothing.

### 3.6 Settings that do nothing on a quiz (redundant)
- **Allow optional retakes** and **Tier 2 up to** are tests only, but both show on every quiz.
- **Retake window** is quizzes only (with the cap on), but shows on every test.

### 3.7 Old words in the help texts and labels (confusing)
- "Retakes need my OK" help: "on a quiz, practice the targets they missed… corrections are the way to 100%" (dialog 359).
- Assessment sheet: "Auto: submitting corrections unlocks the retake" (settings-sheet 158).
- The assignments table chip still reads "Corrections cap · 7-day retake window" on a path quiz (assignments-table.tsx:124-131).
- The **Relearning** (pins) button on tests sets things the path ignores.

### 3.8 Hidden switches nobody sees (confusing)
- A quiz with **no learning targets** quietly stays on the old rules.
- An assignment whose **attempt 1 came before** the switch stays on the old rules (decision 26). The same assignment can be on different rules for different students.
- The **pass mark** is 4 everywhere and can't be seen.
- Moving a bank into the **Practice** column puts it into practice checks. "Open for practice" is a different switch.

---

## 4. Three proposals for a simpler settings screen on path courses

All three only change **what the dialog shows** for a path course. The columns stay, so old assignments and Anatomy are untouched.

### Proposal A · Presets with the path built in, plus Advanced (recommended)

Picking the assessment picks the preset (quiz → Quiz, test → Test). The dialog then shows only what you set every time, plus a plain-English line of what students will do.

```
Assign: U3 Quiz 2 · Physical Science          [ Quiz on the path ▾ ]

  Classes      [x] P1  [x] P3  [ ] P6
  Opens        Nov 10, 8:00 AM      Closes   Nov 14, 3:15 PM
  Access code  [ none ]  ⟳          Time limit  [ none ] min

  What students will do
  ┌──────────────────────────────────────────────────────────────────┐
  │ Below 80% on a target: corrections → Read · Watch · Do → 4 of 5 │
  │ practice check → raised to 80%. Then keep it or retake (3 tries │
  │ in all, retake by 7 days after the quiz).                       │
  │ 80% or higher: corrections → 90%, the path → 100%. No retake.   │
  │ Corrections: you approve them.                                  │
  └──────────────────────────────────────────────────────────────────┘

  ▸ Advanced (threshold, attempts, pass mark, review, window, wait, OK)
```

```
Assign: U2 Test · Biology                      [ Test on the path ▾ ]
  …window and access as above…

  What students will do
  ┌──────────────────────────────────────────────────────────────────┐
  │ Each target below 80%: corrections → Read · Watch · Do → 4 of 5 │
  │ check. Retake unlocks when every line is ✓: Full test or Custom.│
  │ 2 attempts (1 + 1 retake). Highest per target counts.           │
  └──────────────────────────────────────────────────────────────────┘
  ▸ Advanced
```

Advanced, opened (quiz):

```
  Threshold           [ 80 ] %   ⚠ also the score the path raises to
  Attempts            [ 3 ]
  Practice check      pass at [ 4 ] of 5
  Corrections         (•) I approve them   ( ) Approved when turned in
  Retake window       [ 7 ] days after the quiz
  Wait between tries  [ 0 ] hours
  [ ] Retakes need my OK  ⚠ you already approve corrections: two OKs per retake
  [x] The path raises quiz scores (80 / 90 / 100)
      Off: the path only unlocks the retake, like a test.
```

- **Pros**
  - One look at the summary tells you what happens. It's written from the real settings, so it can't drift from them.
  - The settings that do nothing for this type disappear: Tier 2 and optional retakes on a quiz, the window on a test.
  - It needs no new columns: a preset just fills in today's fields.
  - Warnings sit right next to the combinations that surprise people (two OKs, threshold ≠ 80, a test with 1 attempt).
- **Cons**
  - The summary line has to be kept in step with the rule code (it can be built from the same functions).
  - Advanced still holds the confusing combinations; it only labels them.

### Proposal B · Fixed path, almost no settings

On a path course, the path settings aren't editable per assignment. You see a locked card and only window, access, attempts and review mode.

```
  Window / access / time limit   (as today)
  Attempts      [ 3 ]
  Corrections   (•) I approve   ( ) Auto
  ───────────────────────────────────────────
  🔒 Relearning path (set by the course)
     80% line · 4 of 5 check · 7-day retake window · raises 80/90/100
     Change these on the course page.
```

- **Pros**
  - The simplest possible screen, so it can't be misconfigured.
  - Matches how you actually work: the same rules for every Physical Science and Biology quiz.
- **Cons**
  - It loses real flexibility: a harder test with a 70% line, or an easy quiz where you'd want 5 of 5.
  - It needs course-level fields that don't exist yet, which means a schema change and a ticket.
  - A one-off exception needs a trip to the course page, which changes every class.

### Proposal C · Course defaults, then "Use course defaults" on each assignment

The course page gets a **Path defaults** panel (threshold, pass mark, window, review, attempts per type). The dialog shows one switch.

```
  Window / access / time limit   (as today)
  [x] Use Physical Science's path defaults
      80% · 4 of 5 · 7 days · you approve corrections · quiz 3 / test 2 attempts
  (untick to override any of them for this assignment)
```

- **Pros**
  - Set once per course. Exceptions are still possible, and the dialog stays short.
  - It fixes the "assessment defaults don't update old assignments" confusion: assignments follow the course until you override them.
- **Cons**
  - It's the most building: new columns, an "override" state per field, and rules for what happens when a course default changes mid-unit.
  - There are two places to look when something seems wrong.

### Recommendation: **Proposal A**

- It solves the actual surprises (wrong help text, hidden switches, dead settings, one-attempt tests) **without a schema change**.
- It keeps your per-assignment control, but behind a fold.
- The "What students will do" box gives you the subway map from the teacher's side.
- Proposal C can come later if you find yourself changing the same Advanced setting on every assignment.

---

## 5. Settings worth adding under the path

These are limited to gaps the spec names or that the code shows.

1. **Practice check pass mark** (P4, PLAN §4). It's already stored and used; it only needs the field in Advanced ("pass at [4] of 5"). *This is a gap, not a new idea.*
2. **Which relearning modes are offered** (A1, A5, A6, decision 37). Today every published Read · Watch · Do shows, and Watch is the one that YouTube Restricted Mode can break. A **course-level "Offer Watch"** switch, or a per-class one for a period on stricter Chromebooks, would let you turn Watch off without unpublishing the videos. The fallback already handles a target with fewer modes (A5).
3. **Retake window start** (decision 28 + Q5 + example 3.3). One choice: count the 7 days from attempt 1 (today), or from when the path is done. The other option is to keep the rule and **show "Retake by Nov 9" on the step path from day 1**, so students know the clock is running.
4. **A readiness check when you assign** (bank health, Nov 5; A5). It's a warning rather than a setting: "U3.LT4 has no Read · Watch · Do yet, so students will see 'Your teacher will give you a relearning activity'" or "U3.LT2's Practice bank can't fill a deal." Bank health already computes this.
5. **Replace the pins page on path tests** with a read-only **Path content** page: per target, which modes are built, core and extension minutes, and Practice bank health. The old pins stay for pre-launch assignments.
6. **A relearning deadline**: *I'd recommend not adding it.* Decision 33 and Q8 say the path stays open with no deadline, on purpose. It's listed so the question is closed on purpose.

---

## 6. Questions for you

**Q1. The corrections cap checkbox on path quizzes**
- a) Hide it. On the path, quizzes always raise (80 / 90 / 100). **← recommended**
- b) Keep it in Advanced, renamed "The path raises quiz scores (80 / 90 / 100)."
- c) Leave it as it is.

**Q2. Default attempts for a new test**
- a) 2 (1 + 1 retake), matching PLAN.md §2. **← recommended**
- b) Keep 1, and warn on a path test that 1 attempt means no retake.
- c) Keep 1 with no warning.

**Q3. The retake window on a path quiz**
- a) Keep 7 days from attempt 1, and show the "retake by" date on the step path from the start. **← recommended**
- b) Count 7 days from when the path is done.
- c) No window on the path: retake any time until the quiz closes.

**Q4. "Retakes need my OK" together with Teacher-approved corrections**
- a) Keep both possible, with a warning ("two OKs per retake"). **← recommended**
- b) On the path, approving corrections also unlocks the retake.
- c) Hide "Retakes need my OK" on path courses.

**Q5. The practice-check pass mark**
- a) Add it to Advanced: 1–5 of 5, default 4. **← recommended**
- b) Fix it at 4 of 5 everywhere and stop treating it as a setting.

**Q6. The threshold on path assignments**
- a) Editable in Advanced, with a note that it's also the score the path raises to. **← recommended**
- b) Locked at 80 on path courses.
- c) Editable, and the 90% for corrections moves with it (e.g. a 70% line → 85%).

**Q7. Which relearning modes students are offered**
- a) A course switch "Offer Watch" (on by default). **← recommended**
- b) Per-assignment tick boxes for Read, Watch and Do.
- c) Nothing new: rely on the "won't play" fallback.

**Q8. The Relearning (pins) button on path tests**
- a) Replace it with a read-only Path content page (modes built, minutes, bank health). **← recommended**
- b) Hide it on path tests.
- c) Leave it.

**Q9. Settings that do nothing for the type (Tier 2 and optional retakes on a quiz, the retake window on a test)**
- a) Hide them for that type. **← recommended**
- b) Show them greyed out with "Tests only" or "Quizzes only".

**Q10. Which settings screen**
- a) Proposal A: presets plus "What students will do" plus Advanced. **← recommended**
- b) Proposal B: fixed path, settings on the course.
- c) Proposal C: course defaults with a per-assignment override.

**Two to confirm (no change suggested):**
- The 79% → path → 80 vs 80% → corrections → 90 cliff is decisions 17–18 as written. Is it still what you want?
- Quizzes without learning targets silently keep the old rules. Should the dialog warn about this ("This quiz has no learning targets, so the path won't apply")?

**One to test before launch:** with "Show results right after submitting" **off**, check whether the step path shows the scores (its tick boxes print percents).
