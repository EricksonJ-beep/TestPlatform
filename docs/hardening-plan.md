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

- [x] **H2.1 The build says what it is changing, and a preview can be told not to.**
      `scripts/migrate-on-build.mjs` logs the kind of build and the database host, warns when
      a non-production build is about to migrate, and lists any data step (walkthrough, packs,
      CVTC, score history) that failed instead of passing silently. `MIGRATE_ON_PREVIEW=0`
      makes preview builds leave the database alone.
      _Done when:_ the decision function (`scripts/migrate-decision.mjs`) is tested for
      production, preview, a manual build and the switch. Done.
- [J] **H2.2 Turn previews off, or give them their own database.** Left as it was by default,
      because Jon reviews pull requests on their previews, and a preview that doesn't migrate
      breaks on any page that needs a new column (this plan adds some). Two ways to close it:
      (a) in Vercel's Neon integration, turn on a database branch per preview: each preview
      then migrates its own copy and the live data is never touched (best); or
      (b) set `MIGRATE_ON_PREVIEW=0` for the Preview environment and accept that a preview
      with schema changes errors until it is merged.

## H3 — No dead ends on the relearning path

- [x] **H3.1 A practice check that can't be passed isn't dealt.** If the bank can deal fewer
      questions than the pass mark, the student sees "There aren't enough practice questions for
      this target yet. Tell your teacher." Bank health already flags the short band for Jon.
      _Done when:_ tested with a 3-question bank.
- [x] **H3.2 Abandoned timed tests close.** An attempt past its deadline (or claimed and never
      graded, H1.4) is finished when the teacher's dashboard or a test's results page loads, and
      when the student's home loads (`src/lib/attempt-sweep.ts`), not only when that student reopens it. Paused attempts are
      left alone (Finish later).
      _Done when:_ tested: an out-of-time attempt is graded at its `dueAt` by the sweep.
- [x] **H3.3 Best attempt by percent.** Uncapped quizzes and practice pick the best attempt by
      percent, not raw points (8/10 no longer beats 7/7).
      _Done when:_ a test in `grading.test.ts`.
- [x] **H3.4 Fill-in-the-blank forgives typing marks.** Curly apostrophes, a trailing period and
      doubled spaces no longer make a right answer wrong. Case-sensitive mode still respects capitals.
      _Done when:_ tests in `grading.test.ts`.

## H4 — Accounts (students are minors)

- [x] **H4.1 Throttle guessing.** Failed tries are counted per key in `auth_throttle`
      (`src/lib/throttle.ts`, migration 0036): one account's password (10 in 10 minutes), a
      test's access code and a resume code (10 per student), a class join code (60 per network
      address), the teacher invite code (10 per address). Past the limit: "Too many tries. Wait
      a few minutes, then try again." Limits by address are roomy on purpose, because the whole
      school shares one. The login still tells a student whether the username exists (Jon's
      wording for 9th graders); it just can't be tried at speed now.
      _Done when:_ limiter tests; checked in a browser (the 11th try is refused, right password or not).
- [x] **H4.2 A reset ends old sessions.** `users.password_changed_at`; a session that began
      before it is signed out at `/api/session/ended` and told why on the login page. Changing
      your own password signs out your other devices and keeps this one. A temporary password is
      now a must: every page sends the student to "First, pick your own password" until they do.
      _Done when:_ rule tests (`session-rules`, `authz`); both checked in a browser.
- [x] **H4.3 Join codes.** New codes come from the system's secure random source. Claiming a
      name is one conditional UPDATE, and two joins that pick the same username at once no
      longer crash (the test for this found that bug). Code length is unchanged: with the
      throttle, four characters is enough, and students type it by hand.
      _Done when:_ tested with two students claiming one name at the same moment.
- [x] **H4.4 A removed student is out.** Attempt, practice-check and relearning guards also
      require current enrollment in the assignment's class.
      _Done when:_ tested in `authz.test.ts`.
- [x] **H4.5 Security headers.** `next.config.ts` sends `X-Frame-Options: SAMEORIGIN` and
      `frame-ancestors 'self'` (Bloom frames its own hosted activities), `Referrer-Policy`,
      `X-Content-Type-Options`, HSTS and a `Permissions-Policy`. A full Content-Security-Policy
      for scripts needs testing against YouTube and R2 first (H7.6).
- [x] **H4.6 Server-side fetches.** The paper export fetches a typed image address only from
      the public internet (no private or loopback addresses, each redirect re-checked), within
      8 seconds and 10 MB (`src/lib/safe-fetch.ts`). The media route shows only pictures, video
      and audio in the page; anything else downloads as a plain file.
      _Done when:_ tested for a private address, an inward redirect and an oversized response.
- [x] **H4.7 Dependencies.** `npm audit fix`, and Next.js 16.3.5 → 16.4.6 for its critical
      advisory. 18 advisories (1 critical, 8 high) → 6 low or moderate, all inside the `shadcn`
      command-line tool, which never runs in production. Build, lint and tests pass on it.
- [J] **H4.8 Adding a student who already has an account.** Today a teacher who types an existing
      student's email enrolls that account and can then reset its password. Fine for Jon and one
      colleague; before more teachers join, choose: (a) leave it, (b) only within the same
      school organization, (c) the student confirms on next login.
- [J] **H4.9 Temp password format.** One word + 4 digits is easy to say aloud and easy to guess.
      With H4.1 and H4.2 in place it is much safer; lengthening it (two words) is Jon's call.

## H5 — Fast with a full class

- [x] **H5.1 Tier board.** The page sends the version it holds; an unchanged board is answered
      from five small reads instead of the per-student load. Polling stops on a hidden tab and
      never overlaps itself. When the board does load, students are read six at a time rather
      than one after another, and the version is read before the data so a change during the
      load isn't missed.
      _Done when:_ tested that the cheap version always equals the board's own, and moves on a retake.
- [x] **H5.2 Student home, part 1.** Each tab loads only what it shows (the results list and
      the practice shelves were read on every tab).
      _Done when:_ every tab checked in a browser; `student-home` tests pass.
- [ ] **H5.2 Student home, part 2.** Corrections and retake status still load per assignment
      (in parallel, so the wait is short, but 7–12 reads each). Batching them for all of a
      student's assignments is a rewrite of `listStudentAssignments`, the rule every student
      card follows; it deserves its own change with a query-count test, before spring.
- [x] **H5.3 Indexes.** `activity_log(assignment_id)`, and a partial index on answers waiting
      for a manual grade (migration 0037).

## H6 — Accessibility and polish

- [x] **H6.1 Alt text.** The question editor has "Describe this image" (`questions.media_alt`,
      migration 0038). The test, practice, practice check and corrections screens read it out;
      a picture with no description is announced as "Image for this question" instead of being
      skipped. Not yet: a column for it in the CSV import, and descriptions for the pictures
      already in the banks (those are Jon's to write).
      _Done when:_ a save test; checked in a browser.
- [x] **H6.2 Contrast and touch size.** Buttons are `#CC4429` (white text 4.7:1, was 3.75:1 on
      `#E2553A`; PLAN.md §5 updated). Large buttons, which the student and sign-in screens use,
      are 44px, and so are the navigator squares.
- [x] **H6.3 Moving between questions.** On the test screen, focus goes to "Question n of N"
      when the question changes, "One minute left" is announced once, and navigator squares
      carry a check or a flag as well as a colour (practice: a check or an x). Relearning quick
      checks announce "Right!" and "Not quite". Not yet: the focus move on the practice, check
      and corrections screens (it comes with the shared runner shell, see below).
- [x] **H6.4 No backtracking is said out loud.** Next on a blank answer asks once ("You haven't
      answered this one… press Skip it"), and the review screen lists blank questions without
      linking back to them.
- [x] **H6.5 Loading and errors.** A loading skeleton for the student and teacher areas; an
      error page inside each area, so the menu stays; a failed request on any teacher form
      shows on the form. The top bar's search box, which did nothing, is gone. The error pages
      no longer say "nothing is lost"; they say saved answers are safe.
- [x] **H6.6 Videos in corrections and checks.** One component (`QuestionMedia`) shows a
      question's picture and video on all four student screens.

## H7 — Safety net

- [ ] **H7.1 CI builds.** CI also runs `next build` and applies the migrations to a scratch database.
- [ ] **H7.2 Server errors are recorded.** `instrumentation.ts` logs every server error with its
      route to Vercel's logs in one searchable line.
- [J] **H7.3 An error service and backups.** Sentry (or similar) and a nightly database dump both
      need an account or a secret Jon creates.
- [J] **H7.4 A Neon branch for preview builds,** so previews can migrate safely (set in Vercel).
- [ ] **H7.6 A script Content-Security-Policy,** tested against YouTube embeds and R2 uploads.
- [ ] **H7.5 One end-to-end student run** in CI: take a test, do corrections, pass a check.

## Not in this plan

The spec items not built yet (image hotspot, AI generation, numeric variants, Google Classroom
import, blueprint builder, distractor analysis) are features, tracked in PLAN.md §9 Phase 2.
Splitting the four runners and the two 1,000-line components into shared parts is worth doing
after H1 and H6 land, as its own change with no behaviour difference.
