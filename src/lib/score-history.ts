/**
 * Score history upkeep (ticket R7; the rule is `src/lib/score-trail.ts`). `recomputeFinalScore`
 * writes every change from R7 on; this gives the scores from before it their starting point once,
 * on the first production deploy (scripts/score-history-seed.ts), so a later change doesn't hide
 * where they came from: attempt 1 (when it differs) and the counting score as it stands.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Seed history for every counting score that has none; returns the rows written. Safe to re-run. */
export async function seedScoreHistory(): Promise<number> {
  const first = await db.execute(sql`
    insert into score_history (assignment_id, student_id, percent, basis, at)
    select f.assignment_id, f.student_id, a1.percent, 'best_attempt', coalesce(a1.submitted_at, f.computed_at)
    from assignment_final_scores f
    join lateral (
      select a.percent, a.submitted_at from attempts a
      where a.assignment_id = f.assignment_id and a.student_id = f.student_id
        and a.status <> 'in_progress' and a.percent is not null
      order by a.number asc limit 1
    ) a1 on true
    where not exists (
      select 1 from score_history h where h.assignment_id = f.assignment_id and h.student_id = f.student_id
    )
      and abs(a1.percent - f.percent) >= 0.005`);
  const now = await db.execute(sql`
    insert into score_history (assignment_id, student_id, percent, basis, at)
    select f.assignment_id, f.student_id, f.percent, f.basis, f.computed_at
    from assignment_final_scores f
    where not exists (
      select 1 from score_history h
      where h.assignment_id = f.assignment_id and h.student_id = f.student_id
        and abs(h.percent - f.percent) < 0.005
    )`);
  const count = (r: unknown) =>
    Number(
      (r as { rowCount?: number; affectedRows?: number }).rowCount ??
        (r as { affectedRows?: number }).affectedRows ??
        0
    );
  return count(first) + count(now);
}
