# Bloom — instructions for Claude Code

Read PLAN.md before any work. It is the spec and the source of truth.
Follow PHASE0.md ticket by ticket; do not skip ahead. Stop at each "Done when" and at the Ticket 0.4 schema checkpoint.

Stack (decided): Next.js + TypeScript + Tailwind + shadcn/ui · Neon Postgres + Drizzle · Auth.js v5 (Credentials, bcrypt) · Cloudflare R2 (Phase 1) · Vercel.

Non-negotiables:

- Questions are independent records; assessments point at them (PLAN.md §8).
- Every server action that touches data calls an authorization guard first (PLAN.md §7, Ticket 0.5).
- Nothing in the "Parked — NOT approved" list in PLAN.md gets built unless Jon says so.
- Commit after every green "Done when."

Next.js version notes: see AGENTS.md (maintained by `next dev`).
