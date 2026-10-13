# Physical Science practice banks: practice built into Bloom

_Brainstormed with Jon, Oct 13 2026. Platform tickets P2–P4 built Oct 13 (✅ below); content (P5) next. PLAN.md §3.7, §3.7a, §8, §10, Appendix A and docs/decisions.md are updated to match._

## The idea in one line

Stop building practice in Apps Script and walking it over to Bloom. Build it in Bloom: every Physical Science learning target gets a 50-question bank, a practice set that deals a fresh hand from that bank each time, Apps Script–style checking (unlimited tries, hint after 3 misses), and a relearning reading. Think of the Apps Script worksheet as a gym across town that mails Bloom a note when a student shows up. This plan moves the gym inside the school, so Bloom sees every rep.

## Decisions (Jon, Oct 13 2026)

| Question | Decision |
| --- | --- |
| Scope | **Every Physical Science learning target** (A and B), built in batches |
| Missed practice question | **Apps Script style:** unlimited tries, a hint after 3 misses, and the student can reveal the answer + explanation whenever they want |
| Question types | **Varied by target:** math targets (conversions, speed, MA, efficiency) mostly numeric with fresh numbers; vocabulary and concept targets get multiple choice, matching, fill-in-blank, ordering |
| Difficulty | **Ramp:** about 15 easy (remember), 20 medium (understand/apply), 15 hard (apply/analyze) per target; each deal pulls from all three bands |
| Relearning activity | **Reading + worked examples** per target: a short reteach with an analogy, 2–3 worked examples, and a few guided-notes prompts at the end |
| Source material | **Jon's Google Drive** (notes, slides, worksheets, tests for each unit), so vocabulary and methods match how he teaches it |
| Review | **Spot-check only:** Claude loads and publishes; Jon skims a sample and flags anything wrong. Claude self-checks every key and recomputes every numeric answer before loading. |
| Learning target list | Jon's LT sheet (`Bio_PS_AP_LT_Table.xlsx` in Drive) is the source of truth |
| U6.LT5 (Rube Goldberg) | **Smaller bank (about 25)** on energy flow through machine chains, plus a planning guide as its relearning activity |

## Learning targets

Jon's sheet (`Bio_PS_AP_LT_Table.xlsx` in Drive) has 25 Physical Science targets, and Bloom's course file (`scripts/courses/physical-science.ts`) already lists all 25 with matching wording. (An early read of that file missed five one-line entries; nothing was actually missing.)

Note: U4.LT2 (velocity, momentum, **and acceleration**) overlaps U4.LT3 (acceleration). Plan: U4.LT2's bank leans on velocity and momentum, with only a few acceleration questions; U4.LT3 owns acceleration.

## Size of the job

| Unit | Targets | Questions |
| --- | --- | --- |
| 1 · Intro to Physical Science | 4 | 200 |
| 2 · Atomic Structure | 4 | 200 |
| 3 · Bonding | 4 | 200 |
| 4 · Motion | 4 | 200 |
| 5 · Forces | 4 | 200 |
| 6 · Work and Efficiency | 5 | 225 (LT5 is about 25) |
| **Total** | **25** | **about 1,225** questions + 25 relearning readings |

## What Bloom already has

- Practice sets that **deal a fresh hand from a whole bank** each attempt (`practice_sets.bank_id` + `draw_count`, PR #23).
- A practice runner with a **Check answer** button and the explanation shown after (`src/app/student/practice/[attemptId]/practice-runner.tsx`). Today it is **one try per question**.
- Content packs (`content/packs/*`, `scripts/apply-packs.ts`): a `pack.json` + `questions.csv` that loads a bank in one step. This is how the banks will be delivered.
- Practice completion already feeds the retake gates and the "Needed before your retake" list.
- Relearning activities of kind `reading` and `guided_notes`.

## What has to be built

Tickets in order. Each stops at its "Done when" and gets a commit.

### Ticket P1 · Learning targets ✅ (nothing to build)
The course file already has all 25. If the live site is missing any, `npm run db:seed:courses -- physical-science` adds them, and a pack import creates any target code it doesn't find.

### Ticket P2 · A hint on every question ✅
Add a nullable `hint` column to `questions`. Add a `hint` column to the CSV import (`question_import_template.csv`, `scripts/import-csv.ts`, content packs) and a Hint field in the question editor. Teacher preview shows it.
**Done when** a pack with hints loads and the hint shows in the question editor.

### Ticket P3 · Apps Script–style checking in the practice runner ✅
- A wrong check keeps the question open: the student edits and checks again, with no limit.
- After the **3rd miss**, the hint appears.
- A **Show answer** button is always there; it reveals the correct answer + explanation and closes the question (recorded as "revealed").
- A correct check shows the explanation and closes the question.
- Save per question: misses, revealed, correct. (Showing these on the relearning monitor is a later step.)
- **Completion** (PLAN §3.7) changes from "every question answered once" to "**every question in the deal is closed**" (correct or revealed). Best % counts a question as correct only if it was right **before** reveal.

**Done when** a student can miss a question 3 times, see the hint, get it right, and the set completes and counts toward the retake gate.

### Ticket P4 · Difficulty-balanced deals ✅
When a set deals from a bank, draw across difficulty bands (1–2 easy, 3 medium, 4–5 hard) in the 15/20/15 proportion (for a deal of 10: 3 easy, 4 medium, 3 hard), served easy → medium → hard. If a band runs short, fill from what is left.
**Done when** 20 deals from a 50-question bank all contain every band.

### Ticket P5 · Content: one batch per unit

Progress: **Unit 1 ✅** (merged Oct 13 2026, PR #25; packs `ps-u1-lt1..4-practice`, revision 2 after an independent key audit). **Unit 2 ✅** (packs `ps-u2-lt1..4-practice`, audited before first push). **Unit 3 ✅** (packs `ps-u3-lt1..4-practice`; formula fill-ins are case-sensitive).

Lessons from Unit 1:
- Vercel **preview builds use the live database**, and the build step applies migrations and packs. Pushing a pack to any branch puts it in front of students before merge. Check a batch before its first push.
- A pack applies once. To ship corrections, bump `revision` in pack.json: questions update in place by `external_id` (new versions), and the set and notes are found by title.
- Run `npx tsx scripts/check-pack.ts content/packs/<name>` before committing, then an independent audit that recomputes every numeric key from the stem.
- Numeric questions can't check a format, only a value: "write in scientific notation" needs multiple choice or fill-in, not numeric.
For each unit, in order 1 → 6:
1. Pull Jon's Drive materials for the unit (notes, slides, worksheets, tests) and note his vocabulary and methods (how he sets up conversions, which formula triangles, rounding rules, which polyatomic ion list).
2. Write 50 questions per target (25 for U6.LT5) in the pack CSV: target, type, difficulty, Bloom's level, **hint**, explanation, tags.
3. Self-check: verify every key, recompute every numeric answer and tolerance, make sure no question appears twice and no question gives away another one's answer.
4. Write the target's relearning reading: an analogy, 2–3 worked examples, 2–5 guided-notes prompts.
5. Load as a pack: one bank per target (`PS · U1.LT3 · Practice`), one published practice set per target dealing 10 from its bank, one published reading activity per target.
6. Jon spot-checks; fixes go into the pack and reload.

**Done when** (per unit) every target in the unit shows a published practice set and reading on the student Practice tab.

## What changes in PLAN.md

- §3.7 Practice sets: "instant feedback" becomes "unlimited tries, hint after 3 misses, reveal anytime"; completion = every question closed.
- §3.7a Apps Script worksheets: stays supported for worksheets already registered, but it is **no longer the main way to build practice**. New practice is built in Bloom. ("Going forward, every new worksheet is built Bloom-ready" is retired.)
- §5 data model: `questions.hint`; practice answers store tries / hint shown / revealed per question.
- §10: new decision rows for practice checking and Physical Science practice banks.

Nothing here touches the Parked list. Hints are one per question, not per-distractor feedback (which stays parked).

## Open questions (defaults assumed)

- **Deal size:** 10 questions per practice attempt (default). Could be 15 for math targets.
- **Numeric variety:** for math targets, write separate questions with different numbers (default). Dynamic numeric variants (PLAN §10, Phase 2) would later let one template make endless versions.
- **Second teacher:** the Physical Science bank is shared at launch (PLAN §10), so these banks will appear for the co-teacher too.
