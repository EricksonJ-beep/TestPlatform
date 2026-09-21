# Bloom — Phase 0 Task List

*Stack: Next.js + Tailwind + shadcn/ui · Neon Postgres + Drizzle · Auth.js v5 · Vercel (R2 for files arrives in Phase 1).*
*Goal: a deployed, empty-but-real app where both teachers can log in, a student account exists, and the schema + security are in place. Phase 1 (building tests, students taking them) starts only after the checkpoint at the end.*

*How to use: work top to bottom. Each ticket has a **Prompt** you can paste into Claude Code. Do them one at a time and check the **Done when** line before moving on. Expect 1–2 weekend sessions.*

---

## Before you open VS Code (30 min, no Claude needed)

1. **Accounts** — create/confirm: GitHub, Vercel (sign in with GitHub), Neon (neon.tech, sign in with GitHub), Cloudflare (for R2 — needed in Phase 1, fine to skip today), Anthropic API key (console.anthropic.com; only needed in Phase 2 but grab it now).
2. **Node** — install Node LTS (20+) from nodejs.org. Check: `node -v`.
3. **Claude Code** — `npm install -g @anthropic-ai/claude-code`, then `claude` once to log in. Docs: https://docs.claude.com/en/docs/claude-code/overview
4. **Neon project** — New project → name `bloom` → Postgres 16 → region US East (Ohio). Copy the **connection string** (the pooled one) from the dashboard; that's your `DATABASE_URL`. Neon never auto-pauses; it just sleeps when idle and wakes on the first query.
5. **Domain** — buy the one you'll use (optional now; can attach later in Vercel).
6. Make a folder `bloom`, copy `PLAN.md` and this file into it.

---

## Ticket 0.1 — Repo + scaffold
**Prompt:** *Read PLAN.md and PHASE0.md. Initialize a git repo. Scaffold a Next.js app (App Router, TypeScript, Tailwind CSS, ESLint, `src/` directory) in this folder. Add shadcn/ui and install these components: button, input, label, card, dialog, dropdown-menu, table, badge, tabs, toast, form, select. Add Prettier. Commit as "chore: scaffold".*
**Done when:** `npm run dev` shows the default page; `git log` has one commit.

## Ticket 0.2 — Design tokens
**Prompt:** *Implement the Bloom design tokens from PLAN.md §5 in Tailwind config and globals.css: brand teal #0E7C7B, action coral #FF6B5C (buttons use #E2553A), success #2E9E5B, warning #F4A300, error #E5484D, text #1A1A1A, muted #5C6670, page bg #F7F8F9, 8px radius. Load Inter for body and Lexend for headings via next/font. Wire shadcn's theme variables to these tokens. Make a /styleguide page showing colors, type, buttons, badges, and a card so I can eyeball it.*
**Done when:** /styleguide looks like the mockups (teal + coral, calm, roomy).

## Ticket 0.3 — Environment + database client
**Prompt:** *Add `.env.local` (gitignored) with DATABASE_URL (Neon pooled connection string), AUTH_SECRET (generate with `npx auth secret`), and TEACHER_INVITE_CODE, plus a `.env.example`. Install drizzle-orm, drizzle-kit, @neondatabase/serverless, and next-auth@beta (Auth.js v5). Create `src/db/index.ts` exporting a Drizzle client over the Neon serverless driver, and a `drizzle.config.ts`. Add a `/api/health` route that runs `select 1` against the DB.*
**Done when:** `/api/health` returns ok; no secrets appear in client bundles.

## Ticket 0.4 — Schema migration (Phase 0 tables)
**Prompt:** *Define the schema in `src/db/schema.ts` with Drizzle and generate the first migration with drizzle-kit into `drizzle/`. Write the schema implementing the data model in PLAN.md §8 as Postgres tables with sensible types, FKs, indexes, `created_at/updated_at`, and an `updated_at` trigger. Include ALL tables from §8 (identity, standards, content, assessments, delivery, learning cycle, sharing) even though Phase 0 only uses identity — I want the shape right from the start. Key details: `users` (id, email unique, password_hash, `role` enum teacher|student|admin, `first_name`, `last_name`, `organization_id`; `assessments.type` enum practice|formative|summative; `attempts.scope` as JSONB list of learning_target ids or null for full; `corrections.status` enum submitted|approved|returned with `ai_flag` boolean + `ai_note` text; `assignments.retake_threshold` int default 80. Drizzle infers the TypeScript types from the schema; export `InsertX`/`SelectX` types from `src/db/types.ts`. Then STOP and print an ER summary (tables + key columns) for me to review before applying.*
**Done when:** you've read the ER summary, it matches §8, and `npx drizzle-kit migrate` succeeds against the Neon `bloom` database with no errors.

## Ticket 0.5 — Authorization layer
**Prompt:** *Build the server-side authorization layer from PLAN.md §7 and the two-teacher + students model in §3.12: a `src/lib/authz.ts` with `requireSession()`, `requireTeacher()`, `requireStudent()`, `requireOwner(resource)`, `requireShared(resource, permission)`, and `requireEnrolled(classId)`, each throwing a typed error that server actions convert to 403. Every server action and route handler that touches data MUST call one of these first — add an ESLint rule or a wrapper (`withAuthz`) so it can't be forgotten. Rules: teachers read/write only their own banks, assessments, classes, and assignments plus anything shared with them via `shares`; students read only their own enrollments, their classes' assignments, and their own attempts/responses/corrections, and can create/update only their own attempts, responses, and corrections; scores are written only by server code. Write Vitest tests that create two teachers and two students and assert every cross-access case is rejected. Explain each rule in one line above it.*
**Done when:** the tests pass; a request with a student session for another student's attempt returns 403.

## Ticket 0.6 — Auth (email + password, roles)
**Prompt:** *Implement Auth.js v5 with the Credentials provider: email + password checked against `users.password_hash` (bcrypt), JWT sessions carrying `userId` and `role`. Build the /login page (Bloom-branded, calm, matches mockups), logout, and route protection via middleware: /app/* requires a teacher, /student/* requires a student, unauthenticated → /login. Teacher sign-up page gated by TEACHER_INVITE_CODE (so strangers can't register) creates a `users` row with role=teacher; there is no student self-signup. Handle "wrong password" and "no account" with friendly messages. No password-reset email flow for students — that's the teacher's job in 0.8.*
**Done when:** you can log in as a teacher and land on /app; a student login lands on /student; hitting /app as a student redirects.

## Ticket 0.7 — App shell (teacher) + student shell
**Prompt:** *Build the teacher app shell from PLAN.md §5: collapsible teal left sidebar (Dashboard, Question banks, Assessments, Practice sets, Assign, Results, Classes, Shared, Settings), top bar with global search input (non-functional for now), course/term switcher placeholder, and account menu with logout. Dashboard shows the four metric cards (Needs grading, Open tests, Questions, Classes) reading real counts (all zero now) and an empty "Recent results" card. Build the student shell: top bar with Bloom wordmark and name/initials, three tabs Assignments · Practice · My results, empty states with friendly copy. Both responsive down to a Chromebook width.*
**Done when:** it looks like the dashboard mockup with zeros; student home looks like the student mockup with empty states.

## Ticket 0.8 — Classes + student accounts
**Prompt:** *Build /app/classes: create a class (name, course, period, term), list classes, open a class to see its roster. Add students to a class two ways: (a) one at a time (first, last, email, temp password), (b) CSV upload with columns first_name,last_name,email and a generated temp password per row shown once for download. Creating a student is a server action (behind `requireTeacher` + class ownership) that inserts the `users` row with role=student and a bcrypt-hashed temp password, plus the enrollment. Add a "Reset password" button per student that sets a new hashed temp password and shows the plain one to the teacher once. Password hashes never leave the server.*
**Done when:** you can create a class, add three students via CSV, log in as one of them, reset their password, and log in again.

## Ticket 0.9 — Seed + second teacher
**Prompt:** *Write `scripts/seed.ts` that creates: an organization "Cadott High School", two teachers (me and my physical science colleague — use placeholder emails from .env), one course each plus a shared "Physical Science" question bank owned by me and shared co-edit with the colleague via `shares`, one class per teacher with three demo students. Idempotent — safe to run twice.*
**Done when:** both teachers can log in; the colleague can see the shared bank entry and cannot see my private banks (verify by logging in as each).

## Ticket 0.10 — Deploy
**Prompt:** *Push the repo to GitHub. Create a Vercel project from it, set DATABASE_URL, AUTH_SECRET, AUTH_URL (the production URL), and TEACHER_INVITE_CODE in Vercel, deploy. Optionally install the Neon Vercel integration so every preview deployment gets its own database branch. Confirm login works on the deployed URL. If I bought a domain, walk me through attaching it in Vercel.*
**Done when:** you can log in on the live URL from your phone.

## Ticket 0.11 — Housekeeping
**Prompt:** *Add a README with setup steps, a CONTRIBUTING note for my colleague, GitHub Actions that run lint + typecheck + the authorization tests on every push, and a `docs/decisions.md` that mirrors the decisions log in PLAN.md. Update PLAN.md's Phase 0 line to "complete" with today's date.*
**Done when:** CI is green on main.

---

## Checkpoint before Phase 1 (do this yourself)

- [ ] Both teachers logged in on the live URL
- [ ] A student logged in on a Chromebook
- [ ] You've read the schema (ER summary from 0.4) and it matches PLAN.md §8, including `assessments.type`, `attempts.scope`, `corrections`, `attempt_target_scores`, `assignment_final_scores`
- [ ] Authorization tests pass; you tried to view another student's data as a student and got a 403
- [ ] Design tokens look right on /styleguide

When all five are checked, tell Claude Code: *"Phase 0 is done. Read PLAN.md §9 Phase 1 and propose an ordered ticket list like PHASE0.md, starting with question banks + CSV import (Appendix A)."*

---

## Tips for working with Claude Code on this

- **One ticket per session** and start each with "Read PLAN.md." Context is the thing that keeps it consistent.
- When it proposes a shortcut that contradicts the spec (e.g., storing questions inside assessments), say "no — questions are independent records; see PLAN.md §8."
- Ask it to **explain every authorization rule in plain English** before it writes the tests; that's the one place a mistake leaks student data. Never let a server action skip the `requireX()` call "just for now."
- Commit after every green "Done when." Small commits make it easy to roll back a bad ticket.
- If it gets stuck, paste the exact error and say "diagnose before fixing." It's faster than letting it guess.
