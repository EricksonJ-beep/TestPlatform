# Hardening plan (Jon, Nov 9 2026)

Jon, after the Nov 9 review of the whole app: "Go ahead and build these all out in a plan and
lets get after them."

The review found Bloom sound (lint, typecheck and 794 tests green; answer keys never reach a
student's browser; every action guarded). What it found weak is the hallways between the rooms:
what happens on a wifi drop, a double-click, a second tab, or a build that isn't production.
This plan fixes those. It adds no features and changes no grading rule except H3.3, which is a bug.

Tickets run in order. Each has a "Done when"; commit after each green one (CLAUDE.md).
Status: `[ ]` to do · `[x]` done · `[J]` waits on Jon (a choice only he can make).

## H1 — A student's work is never lost in a test

- [x] **H1.1 Autosave retries.** `test-runner.tsx`: a save that fails (the request itself, or a
      server error) stays in a per-question "unsaved" list and is retried with backoff and when
      the browser comes back online. The header says "Not saved. Trying again…" while the list
      is non-empty. Submit waits for the list to empty, and says so if it can't.
      _Done when:_ a pure retry queue (`src/lib/save-queue.ts`) has tests for fail → retry →
      saved, newest answer wins, and "flush before submit"; the runner uses it.
- [x] **H1.2 Submit never hangs.** A submit whose request fails resets the button, shows "Couldn't
      reach Bloom. Check your wifi and try again," and at time-up retries by itself.
      Typed answers still inside the 500 ms debounce are flushed before submit.
      _Done when:_ covered by the save-queue tests plus the runner change; no path leaves
      `submitting` true after a rejection.
- [x] **H1.3 Ordering questions.** The order a student sees is saved when the question is first
      shown answerable, so "it's already right" is an answer, not a blank. The review screen
      counts it as answered only after the student has seen it.
      _Done when:_ checked in a browser (Nov 9): an untouched ordering question reaches the
      review screen as answered and is graded on the order shown. (It lives in the shared answer
      input, so practice and practice checks get it too. No UI test harness yet: H7.5.)
- [x] **H1.4 Submit is claimed once and can be finished later.** `submitAttempt` claims the
      attempt with one conditional UPDATE (`submitted_at` set where still in progress), so two
      tabs can't both grade. `finalizeAttempt` writes every response score in one statement,
      then the target scores, then flips the status last, so a failure midway leaves an attempt
      that the next submit (or the sweep, H3.2) finishes. Autosaves are refused once claimed.
      A racing Start returns the attempt that won instead of a 500.
      _Done when:_ tests for double submit (one grades, one gets 409), a claimed-but-ungraded
      attempt finishing on the next submit, a save after the claim refused, and a double start.
- [x] **H1.5 The other runners.** Practice, practice check, corrections and relearning quick
      checks get the same "couldn't reach Bloom" recovery instead of a stuck "Checking…".
      _Done when:_ one shared helper (`safe`, `src/lib/safe-action.ts`) wraps those calls and
      `useAction` (every teacher form); each runner resets on failure. Corrections drafts use
      the H1.1 queue, and Submit corrections waits for it.

## H2 — Builds can't change the live database by accident

- [ ] **H2.1 Migrate on production builds only.** `scripts/migrate-on-build.mjs` runs migrations,
      the walkthrough and packs only when `VERCEL_ENV` is `production` (or unset with
      `MIGRATE_ON_BUILD=1`, for a manual build). A preview build prints why it skipped.
      Every step's exit code is checked; a failed step fails the build.
      _Done when:_ a test of the decision function covers production, preview, development and
      the override. **Note for Jon:** a preview whose code needs a new table will then error on
      that page until it is merged. The safe fix is a Neon branch for previews (H7.4).

## H3 — No dead ends on the relearning path

- [ ] **H3.1 A practice check that can't be passed isn't dealt.** If the bank can deal fewer
      questions than the pass mark, the student sees "There aren't enough practice questions for
      this target yet. Tell your teacher," and the short deal shows in Needs you / Bank health.
      _Done when:_ tested with a 3-question bank.
- [ ] **H3.2 Abandoned timed tests close.** An attempt past its deadline (or claimed and never
      graded, H1.4) is finished when the teacher's results, gradebook or dashboard loads, and
      when the student's home loads, not only when that student reopens it. Paused attempts are
      left alone (Finish later).
      _Done when:_ tested: an out-of-time attempt is graded at its `dueAt` by the sweep.
- [ ] **H3.3 Best attempt by percent.** Uncapped quizzes and practice pick the best attempt by
      percent, not raw points (8/10 no longer beats 7/7).
      _Done when:_ a test in `grading.test.ts`.
- [ ] **H3.4 Fill-in-the-blank forgives typing marks.** Curly apostrophes, a trailing period and
      doubled spaces no longer make a right answer wrong. Case-sensitive mode still respects capitals.
      _Done when:_ tests in `grading.test.ts`.

## H4 — Accounts (students are minors)

- [ ] **H4.1 Throttle guessing.** Login, join code lookup, claiming a name, access codes, resume
      codes and the teacher invite code: a small table of failed tries per key (identifier and
      IP), 10 tries per 10 minutes, then "Too many tries. Wait a few minutes."
      _Done when:_ migration + tests for the limiter and for login.
- [ ] **H4.2 A reset ends old sessions.** `users.password_changed_at`; a session older than it is
      signed out. "Must change password" becomes a redirect to the password page, not a banner.
      _Done when:_ tested in the session guard.
- [ ] **H4.3 Join codes.** New codes come from a secure random source and are longer; claiming a
      name is one conditional UPDATE so two students can't claim the same row.
      _Done when:_ tested with a racing claim.
- [ ] **H4.4 A removed student is out.** Attempt, practice-check and relearning guards also require
      current enrollment in the assignment's class.
      _Done when:_ tested in `authz.test.ts`.
- [ ] **H4.5 Security headers.** `next.config.ts` sends `X-Frame-Options: DENY`,
      `Referrer-Policy`, `X-Content-Type-Options`, HSTS and a `Permissions-Policy`.
      (A full Content-Security-Policy needs testing against YouTube and R2; parked to H7.)
- [ ] **H4.6 Server-side fetches.** The paper export only fetches images from Bloom's own storage
      or public hosts (no private addresses), with a timeout and a size cap. The media route
      serves only image/video/audio/PDF types.
      _Done when:_ tested for a private address and an oversized response.
- [ ] **H4.7 Dependencies.** `npm audit fix` (non-breaking); move dev-only packages to
      devDependencies.
- [J] **H4.8 Adding a student who already has an account.** Today a teacher who types an existing
      student's email enrolls that account and can then reset its password. Fine for Jon and one
      colleague; before more teachers join, choose: (a) leave it, (b) only within the same
      school organization, (c) the student confirms on next login.
- [J] **H4.9 Temp password format.** One word + 4 digits is easy to say aloud and easy to guess.
      With H4.1 and H4.2 in place it is much safer; lengthening it (two words) is Jon's call.

## H5 — Fast with a full class

- [ ] **H5.1 Tier board.** The poll pauses on a hidden tab and never overlaps itself; the route
      checks the board's version first and answers "unchanged" without loading the board; the
      load itself is batched (no per-student query loops).
      _Done when:_ a test asserts the same board as before from the batched loader.
- [ ] **H5.2 Student home.** Corrections and retake status load in batches for all of a student's
      assignments, and each tab loads only what it shows.
      _Done when:_ existing `student-home` tests still pass and a query-count test holds the line.
- [ ] **H5.3 Indexes.** `activity_log(assignment_id)`, and a partial index for answers waiting on
      a manual grade.

## H6 — Accessibility and polish

- [ ] **H6.1 Alt text.** The question editor gets a "Describe this image" field; every runner
      passes it to the image.
- [ ] **H6.2 Contrast and touch size.** Primary buttons darken to pass 4.5:1; runner buttons are 44px.
- [ ] **H6.3 Moving between questions.** Focus goes to the "Question n of N" heading; right/wrong
      feedback and "1 minute left" are announced; navigator squares carry a mark, not just a colour.
- [ ] **H6.4 No backtracking is said out loud.** A warning before Next on a blank answer; the
      review screen's jump links hide when backtracking is off.
- [ ] **H6.5 Loading and errors.** `loading.tsx` for the student and teacher areas; a section-level
      `error.tsx`; the dead search box in the top bar is removed.
- [ ] **H6.6 Videos in corrections and checks.** A question's video shows wherever its image does.

## H7 — Safety net

- [ ] **H7.1 CI builds.** CI also runs `next build` and applies the migrations to a scratch database.
- [ ] **H7.2 Server errors are recorded.** `instrumentation.ts` logs every server error with its
      route to Vercel's logs in one searchable line.
- [J] **H7.3 An error service and backups.** Sentry (or similar) and a nightly database dump both
      need an account or a secret Jon creates.
- [J] **H7.4 A Neon branch for preview builds,** so previews can migrate safely (set in Vercel).
- [ ] **H7.5 One end-to-end student run** in CI: take a test, do corrections, pass a check.

## Not in this plan

The spec items not built yet (image hotspot, AI generation, numeric variants, Google Classroom
import, blueprint builder, distractor analysis) are features, tracked in PLAN.md §9 Phase 2.
Splitting the four runners and the two 1,000-line components into shared parts is worth doing
after H1 and H6 land, as its own change with no behaviour difference.
