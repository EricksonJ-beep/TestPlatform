# Bloom

Standards-aligned assessments for Cadott High School, with a corrections-and-retake
learning cycle. Spec: [PLAN.md](PLAN.md). Phase 0 tickets: [PHASE0.md](PHASE0.md).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · Neon Postgres +
Drizzle · Auth.js v5 (email + password, bcrypt) · Vercel. Cloudflare R2 arrives in Phase 1.

## Local setup

1. Node 20+ (`node -v`). Then `npm ci`.
2. Copy `.env.example` to `.env.local`. Generate `AUTH_SECRET` with `openssl rand -base64 32`
   and pick a `TEACHER_INVITE_CODE`. Set the `SEED_*` emails and passwords.
3. Start the local database in its own terminal. It is an embedded Postgres (PGlite) served on
   `127.0.0.1:5433`; nothing to install. Data lives in `./.pglite` (gitignored).

   ```bash
   npm run db:local
   ```

4. Apply migrations and seed two teachers, a shared bank, and demo classes:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. Run the app and log in at <http://localhost:3000/login> with a `SEED_TEACHER_*` account.

   ```bash
   npm run dev
   ```

To use the real Neon database instead, set `DATABASE_URL` in `.env.local` to the pooled Neon
connection string; the client switches to the Neon serverless driver automatically.

## Scripts

| Script                | What it does                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `npm run dev`         | Next dev server                                                      |
| `npm run db:local`    | Local PGlite Postgres on port 5433 (keep it running)                 |
| `npm run db:migrate`  | Apply `drizzle/` migrations to `DATABASE_URL`                        |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts`                |
| `npm run db:seed`     | Idempotent seed (`scripts/seed.ts`)                                  |
| `npm run db:studio`   | Drizzle Studio                                                       |
| `npm test`            | Vitest: authorization rules, class actions, CSV (in-memory Postgres) |
| `npm run lint`        | ESLint, including the `bloom/require-authz` rule                     |
| `npm run typecheck`   | `next typegen` + `tsc --noEmit`                                      |
| `npm run format`      | Prettier (Markdown is excluded on purpose)                           |

## How the code is laid out

- `src/db/schema.ts` holds every table from PLAN.md §8; `src/db/types.ts` the inferred row
  types; `drizzle/` the migrations (`0001` adds the `updated_at` trigger); `docs/er-summary.md`
  the table summary for review.
- `src/lib/authz.ts` is the server-side authorization layer. Every server action and route
  handler calls a `require*` guard first; the ESLint rule in `eslint-rules/require-authz.mjs`
  fails the build otherwise. Read the one-line rule above each guard.
- `src/auth.ts` and `src/auth.config.ts` configure Auth.js; `src/proxy.ts` protects `/app/*`
  (teachers) and `/student/*` (students).
- `src/app/app/*` is the teacher app, `src/app/student/*` the student app, and
  `src/app/(auth)/*` login, teacher signup (invite code), and logout.
- `src/app/styleguide` renders the design tokens for eyeballing.

## Deploying (Vercel + Neon)

1. Create a Neon project `bloom` and copy the **pooled** connection string.
2. Import the GitHub repo into Vercel. Set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` (the
   production URL), and `TEACHER_INVITE_CODE`.
3. Run migrations against Neon once from your machine, then seed if wanted:

   ```bash
   DATABASE_URL="<neon url>" npm run db:migrate
   DATABASE_URL="<neon url>" npm run db:seed
   ```

4. Deploy. Confirm `/api/health` returns `{"ok":true,"db":"neon"}` and log in on the live URL.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the working agreement and
[docs/decisions.md](docs/decisions.md) for the decisions log.
