# Bloom — Phase 1 Task List

*Goal (PLAN.md §9): real quizzes and tests with real classes, with corrections and retakes working. Students log in, take a test, get auto-graded, do corrections, and retake. Both teachers share the Physical Science bank.*

*How to use: same as PHASE0.md. Work top to bottom, one ticket per session, start each with "Read PLAN.md and PHASE1.md." Check the **Done when** before moving on. Commit after every green one. Tickets 1.1–1.9 are the straight line to "a class takes a quiz online"; 1.10–1.16 add the learning cycle and the teacher views; 1.17–1.18 finish the phase.*

*Standing rules for every ticket: every new server action and route handler calls a `require*` guard first (the lint rule enforces it); every ticket that adds a resource type adds cross-access cases to `src/lib/authz.test.ts`; questions stay independent records; nothing from the parked list.*

---

## Before you start (20 min, no Claude needed)

1. **Cloudflare R2** — create a bucket `bloom-media` (needed at 1.4). Create an R2 API token with object read/write and note the account id, access key, and secret key. Enable public access on the bucket or plan to serve through signed URLs; either works for 1.4.
2. **Anthropic API key** — needed at 1.17 (Word/PDF import). Put it in `.env.local` as `ANTHROPIC_API_KEY`; add it to Vercel when 1.17 ships.
3. **A real roster** — export one class from Skyward or Google Classroom as `first_name,last_name,email` so 1.9's checkpoint uses real students.
4. **One real test** — pick an existing quiz (Anatomy CSV bank rows, or a biology test) to be the first thing students take.

---

## Ticket 1.1 — Courses, units, learning targets, pools
**Prompt:** *Read PLAN.md and PHASE1.md. Build the course structure the rest of Phase 1 hangs on: /app/courses lists my courses; a course page manages its units (ordered), learning targets (code like "LT4", title, description, unit), and question pools (name, description, tagged targets). Server actions behind `requireOwner({type:"course"})`. Learning-target codes are unique per course (case-insensitive). Add a reusable `<TargetChip>` component (teal chip with the code, used everywhere later) and a `<TargetPicker>` multi-select. Replace the top-bar course/term switcher placeholder with a real switcher that remembers the current course in a cookie. Authz tests for course, unit, target, and pool cross-access.*
**Done when:** you can create Biology with units and LT1–LT4, create a pool tagged to LT4, and the colleague cannot see or edit any of it.

## Ticket 1.2 — Question banks + CSV import (Appendix A)
**Prompt:** *Build /app/banks for real: create/rename/archive banks (owner or shared co_edit), bank page with a filterable question list (type, target, difficulty, bloom, tags, text search), and the CSV bulk importer from PLAN.md Appendix A using `question_import_template.csv` as the contract and `src/lib/csv.ts` as the parser. The importer is a wizard: upload → preview table with per-row status (ok / warning / error and the reason) → fix or skip → confirm; nothing is written until confirm. Implement every rule in Appendix A: required columns, `correct` conventions per type, `external_id` update-as-new-version, auto-create targets and pools by name within the course (report "created N"), `points`/`difficulty`/`bloom`/`grading` defaults, `tags` dedupe, and `stimulus_ref` grouping into one `stimuli` row per ref. Absolute `image_url`/`video_url` are stored as links; relative filenames are flagged "needs file" until 1.4. Write Vitest cases for the parser-to-rows mapping covering each question type and each failure. Import into the shared Physical Science bank must work for the colleague (co_edit).*
**Done when:** the template CSV imports cleanly into a bank with the right targets, pools, options, and stimulus; a second import with the same `external_id`s updates instead of duplicating; a bad row is rejected without stopping the others.

## Ticket 1.3 — Question editor
**Prompt:** *Build the question editor (slide-in panel from the bank list, and a full page): create/edit multiple choice, multiple select, true/false, fill-in-blank, short answer, extended response, and numeric questions. Fields per PLAN.md §3.2: stem (rich text with sub/superscript and LaTeX), options with correct flags and per-option feedback, explanation, points, difficulty, Bloom's level, learning targets, standards, unit/topic, tags, private notes, and numeric grading config (exact / ± / % / range, unit). Saving an edit bumps `version` and keeps the previous row (version history list, read-only). Bulk actions on the list: tag, move to bank, duplicate, archive. Authz: owner or co_edit share on the bank.*
**Done when:** you can author one of each type, edit one and see two versions, and bulk-tag five questions.

## Ticket 1.4 — Media storage (Cloudflare R2)
**Prompt:** *Add Cloudflare R2 for images and video (PLAN.md §7). `src/lib/storage.ts` wraps the S3 API: presigned upload URLs from a server action (behind `requireTeacher`), object keys namespaced per owner, size and MIME limits, and a `media_assets` row per upload. Add image upload with crop and video upload or YouTube link to the question editor and to stimuli. Extend the CSV importer to accept a zip or multiple files alongside the CSV and resolve relative `image_url`/`video_url`/`stimulus_image_url` filenames to uploads. Serve media through URLs students can load without leaking the bucket credentials. Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`; document them in `.env.example` and README.*
**Done when:** a question with an uploaded image renders it on both the editor and a student preview, and a CSV + zip import attaches the right files.

## Ticket 1.5 — Shared stimulus
**Prompt:** *Finish shared stimuli (PLAN.md §3.2): a stimuli manager per course (text passage, image, video, audio), attach/detach a stimulus to a group of questions, and rendering rules: in any list or test view, questions sharing a `stimulus_id` are kept contiguous and the stimulus renders once above them (or pinned when questions are shown one at a time). When a question group with a stimulus is placed in a pool, a draw that picks one of them can pull the whole group (setting on the pool). Reusable across assessments.*
**Done when:** the tomato-graph rows from the template render as one graph with its questions beneath, in the bank preview and in a test preview.

## Ticket 1.6 — Grading engine
**Prompt:** *Write the pure grading library `src/lib/grading/` before any test-taking UI: one function per question type that takes the question (options, grading config) and a response and returns points earned, max points, correctness, and per-option detail. Cover multiple choice, multiple select (all-or-nothing and partial credit per config), true/false, fill-in-blank (accepted answers, case-insensitive, trimmed), numeric (exact, ± tolerance, % tolerance, range, unit-aware so `15 m/s`, `15m/s`, and `15` all match when a unit is set), short answer (keyword auto-grade or manual), and extended response (manual). Then the attempt scorer: given an attempt's `question_set` and responses, compute total, per-target scores (`attempt_target_scores`), and the assignment final score (`assignment_final_scores`) using highest-per-target for summatives and highest-attempt for formatives, plus tier per PLAN.md §3.11. Exhaustive Vitest tables, including the worked example in §4.*
**Done when:** tests pass, including the §4 example (37/40 then LT4 retake to 9 → 39/40).

## Ticket 1.7 — Assessment builder
**Prompt:** *Build /app/assessments: list, create, and the builder from PLAN.md §3.4. Left: the bank (with filters); right: the test with sections, drag to add and reorder, per-question points override, auto-totals. Each section is fixed questions and/or "draw N from pool X". Set the type (practice / formative / summative) and its attempt policy, review mode, retake threshold, optional retakes, randomize question and answer order, one-at-a-time and backtracking, show-results setting. When type = summative, nudge toward one section per learning target, each backed by that target's pool, and warn if a section has no target. Preview as student. Duplicate an assessment. Authz: owner or co_edit share.*
**Done when:** you can build a summative with four LT sections drawing from four pools, and a formative quiz of ten fixed questions, and preview both.

## Ticket 1.8 — Assign to a class
**Prompt:** *Build /app/assign: choose an assessment and one or more classes; set open/close window, access code, time limit, attempts allowed (defaults by type), review mode, retake threshold, optional retakes, tier boundaries, and whether results show immediately. An assignments list with status (scheduled / open / closed) and quick actions (close now, extend). Per-student accommodations: extended time and font scaling stored on the assignment or enrollment. Server-side rules for what a student may see: assignment visible only within its window to enrolled students, access code required if set. Authz tests for assignment cross-access from another teacher and a non-enrolled student.*
**Done when:** the quiz from 1.7 is assigned to Biology · Period 3 with a 20-minute limit and an access code, and appears on the student home with the right dates.

## Ticket 1.9 — Students take a test
**Prompt:** *Build the student side end to end (PLAN.md §5 student screens 2–4). Assignments tab: one card per assignment with the status pill and single action (Not started / In progress / Done for now). Start attempt: server action builds the exact `question_set` (fixed questions plus pool draws, randomized per settings, stimulus groups contiguous), stores it on the attempt, and sets `due_at` from the time limit plus accommodations. Test screen: thin header (title, Saved, countdown, full-screen), progress bar, question n of N with the target chip, stem in 15px, media panel, large tappable answer rows, flag for review, previous/next, bottom navigator (hidden when no backtracking), tab-switch count in the footer. Autosave every answer via a server action guarded by `requireAttemptAccess` and `assertOwnStudentRow`; the server rejects saves after `due_at` or after submit. Submit review screen with answered/flagged/unanswered counts and a blank-answer warning; confirm required; autosubmit at 0:00. On submit, grade with 1.6 and write scores server-side only. Then test on a Chromebook.*
**Done when:** three real students take the 1.8 quiz on Chromebooks, answers autosave through a refresh, the timer autosubmits, and scores appear correctly for you.

## Ticket 1.10 — Results, gradebook, manual grading, export
**Prompt:** *Build /app/results: per assignment, a gradebook of students × attempts with each score and the highest in bold, corrections status, and finish time; per-student review showing each question, their answer versus the correct one, and their corrections. A manual grading queue for short answer and extended response with a simple rubric/points entry; any score can be overridden with a note; overrides recompute final scores. CSV export of highest scores formatted for Skyward entry. Fill the dashboard's Needs grading and Recent results with real data.*
**Done when:** you grade two extended responses, override one score, and export a CSV with one row per student and the highest score.

## Ticket 1.11 — Corrections + review gate
**Prompt:** *Build the corrections flow (PLAN.md §4, §5 screen 5). After a graded attempt, missed questions within the targets being retaken (all missed for formatives) get a corrections form: the question with the student's answer marked wrong, a short hint (never the answer), and two required fields: correct answer, and why in the student's own words (min two sentences; a verbatim copy of the explanation is rejected). Autosave, previous / save & next, revise before final submit. Review gate per assignment: auto (submit unlocks) or teacher-approved. Teacher approval queue at /app/results/corrections: one card per submitted set, expand to read, approve all or return with a note, keyboard shortcuts A and R. `ai_flag` stays false in Phase 1 (the AI first-pass is Phase 2) but the queue shows the flag when present.*
**Done when:** a student submits corrections on a formative, you approve them from the queue, and the student's card changes state.

## Ticket 1.12 — Retakes: formative and targeted summative
**Prompt:** *Implement retakes (PLAN.md §2, §4). Formative: same assessment up to the attempt limit, corrections required before each retake, re-randomized per settings. Summative: after attempt 1, mark each target below the threshold as required and each at/above as optional (opt-in checkboxes on the student card, on by default when the assignment allows); create `retake_gates` rows; when every gate for the selected targets is satisfied (corrections approved; activity and practice gates arrive in 1.13, so make them configurable and default to satisfied until then), the retake starts with `scope` = selected target ids and serves new questions from each target's pool, same count as the original section. Grade per target; final score is max per target then summed; `assignment_final_scores` and tiers recompute after every relevant event. Student card states from PLAN.md §5: Corrections needed, Corrections submitted, Retake required, Retake available, Done.*
**Done when:** the §4 worked example plays out end to end with a real student account.

## Ticket 1.13 — Practice sets + relearning activities
**Prompt:** *Build /app/practice (PLAN.md §3.7): publish practice sets (fixed questions or draw from a pool) and relearning activities (video via YouTube or upload, reading page, external link, guided notes with 2–5 prompts), each tagged to learning targets, reusable and sequenceable. Student Practice tab: always open, unlimited attempts, instant feedback with explanations, never graded; completion = every question answered once; best % tracked. Activity completion rules per §3.7 (video ≥90% watched via player events; reading scrolled to end + "I finished"; link opened + "I finished", optionally teacher-verified; guided notes all prompts answered). Wire the activity and practice gates into 1.12's `retake_gates`, add the "Needed before your retake" group with the three-item checklist per target, and teacher pins per assignment (`assignment_pins`).*
**Done when:** a student with LT4 required completes a video and a practice set, the gate unlocks, and the retake button turns on.

## Ticket 1.14 — Apps Script worksheet webhook
**Prompt:** *Implement the worksheet integration (PLAN.md §3.7a, Appendix B). `POST /api/integrations/worksheet` (a `publicRoute` that verifies `X-Bloom-Secret` against `BLOOM_WORKSHEET_SECRET`): upsert `worksheets` by `scriptId` (creating an unregistered entry), insert a `worksheet_events` row idempotent on (scriptId, email, at), match the email to a student, record completion for the practice set / activity the worksheet counts as, apply the section → target map, and recompute gates. Teacher UI at /app/practice/worksheets: register a worksheet (paste link or script id), choose counts-as, tag targets, map section titles to targets, and an "unmatched submissions" list. Add the Appendix B block to one real worksheet and redeploy it.*
**Done when:** a final submit on a real worksheet shows up as a completed practice set for that student within seconds.

## Ticket 1.15 — Live tier board + relearning monitor
**Prompt:** *Build the tier board and monitor (PLAN.md §3.11, §5 6b). /app/results/[assignment]/tiers: three columns, student cards with required (coral) and optional (gray) target chips and %, relearning stage, "moved up today" marker, header stats and footer (moved up this week, most-missed target), class-period filter. Polling every 5–10 s with SWR keyed on attempts, corrections, and final scores. Click a card → relearning monitor: per target, attempt-1 score, corrections status, practice activity, time on task, readiness line; plus the class readiness table sortable by readiness. Put the "class at a glance" strip on the dashboard.*
**Done when:** with the board projected, a student's retake lifts them a tier within one poll.

## Ticket 1.16 — Sharing for two teachers
**Prompt:** *Finish sharing (PLAN.md §3.12): a Share dialog on banks and assessments (pick a teacher by email, permission view / copy / co_edit, revoke), "Copy to my bank/assessments" on the Shared page, and co_edit writes enforced through `requireShared(..., "co_edit")` everywhere a bank or assessment is edited (editor, importer, builder). Shared question edits are visible to both. Authz tests: view cannot edit, copy cannot edit but can duplicate, co_edit can edit, nobody sees unshared items.*
**Done when:** the colleague imports a CSV into the shared Physical Science bank, you see the questions, and neither of you can open the other's private bank.

## Ticket 1.17 — Word/PDF AI-assisted import
**Prompt:** *Build the AI-assisted parser for past tests (PLAN.md §3.5): upload a .docx or .pdf, extract text server-side, send it to the Anthropic API with a structured-output prompt that returns questions in the Appendix A row shape (type, stem, options, correct, explanation when present), then drop the result into the same preview-and-confirm wizard as 1.2 so every question is reviewed before it enters the bank. Human in the loop always. Rate-limit and size-limit uploads; log token usage.*
**Done when:** a biology test PDF imports as a reviewable batch and, after confirming, lands in a bank with the right answer keys.

## Ticket 1.18 — Student account polish + hardening + checkpoint
**Prompt:** *Finish the phase: a student change-password screen with a nudge when `must_change_password` is set; font scaling and extended time honored on the test screen; Tier 1 integrity checks re-verified end to end (window, access code, roster-only, attempt limits, server-side time); empty and error states everywhere a student could land; Chromebook pass at 1366×768 and phone width; a final authz sweep listing every server action and its guard; update README, docs/decisions.md, and PLAN.md's Phase 1 line.*
**Done when:** the checkpoint below is fully checked.

---

## Checkpoint before Phase 2 (do this yourself)

- [ ] A real class took a real quiz on Chromebooks; scores matched your expectations
- [ ] A student did corrections, a retake, and their highest score counted
- [ ] A summative with one section per target produced a targeted retake for one student
- [ ] The tier board moved a student up live during a relearning day
- [ ] The colleague imported into the shared bank and cannot see your private banks
- [ ] A worksheet final submit completed a practice gate
- [ ] `npm test` includes cross-access cases for every Phase 1 resource type

When all seven are checked, tell Claude Code: *"Phase 1 is done. Read PLAN.md §9 Phase 2 and propose a ticket list like PHASE1.md, starting with AI generation and the corrections first-pass."*

---

## Tips for Phase 1

- **Do 1.6 before 1.9.** Grading as a pure library with tests is what makes the test screen trustworthy; never grade in the UI.
- **Every score is written by server code.** Student actions save answers, never points. If a ticket tempts you otherwise, stop.
- **Keep `attempts.question_set` exact.** It is what makes retakes, pools, and analytics reproducible.
- **Push small.** Every push deploys to https://bloom-iota-six.vercel.app; a broken main is a broken classroom.
