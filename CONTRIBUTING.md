# Contributing to Bloom

A note for the second teacher on the project, and for future us.

## Getting an account

Ask Jon for the **teacher invite code**, then create your account at `/signup`. Students never
sign up themselves: a teacher adds them to a class, one at a time or by CSV, and hands them a
temporary password. You can reset any student's password from the class roster.

## Working on the code

- Read `PLAN.md` first. It is the spec and the source of truth. `PHASE0.md` and later phase
  files are the ticket lists.
- Follow the local setup in `README.md`. Keep `npm run db:local` running in its own terminal.
- Before pushing, run `npm run lint`, `npm run typecheck`, and `npm test`. CI runs the same three.
- Commit after every green "Done when". Small commits are easy to roll back.

## Rules we don't bend

1. **Questions are independent records; assessments point at them.** Never store questions
   inside an assessment (PLAN.md §8).
2. **Every server action or route handler that touches data calls an authorization guard
   first**: `requireTeacher()`, `requireOwner()`, `requireEnrolled()`, and friends. The lint
   rule `bloom/require-authz` enforces it. Do not disable it "just for now". Scores are written
   only by server code.
3. **Nothing on the "Parked, NOT approved" list in PLAN.md** gets built unless Jon says so.
4. **Highest score counts, always.** Students are never punished for trying again.

## Sharing between us

Banks and assessments are private by default. A share grants `view`, `copy`, or `co_edit` to
one person; the Physical Science bank is `co_edit` for both of us. The authorization tests in
`src/lib/authz.test.ts` assert that a colleague can never see the other's private material.
