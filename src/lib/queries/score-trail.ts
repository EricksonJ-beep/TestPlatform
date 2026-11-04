/**
 * Score trail reads (ticket R7): each (assignment, student) pair's trail, from `score_history`, or
 * attempt 1 and the counting score where there's no history yet. `loadScoreTrails` reads what it
 * needs in three batched queries; the class gradebook already holds the counting scores and the
 * attempts, so it reads only the history (`scoreHistoryColumns`) and calls `buildTrails`. Reads
 * only; callers pass the guards first.
 */
import { and, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FinalBasis } from "@/db/schema";
import { scoreTrail, type ScoreStep } from "@/lib/score-trail";

const key = (assignmentId: string, studentId: string) => `${assignmentId}:${studentId}`;

type Pair = { assignmentId: string; studentId: string };

/** What a trail reads from `score_history`. */
export const scoreHistoryColumns = {
  assignmentId: schema.scoreHistory.assignmentId,
  studentId: schema.scoreHistory.studentId,
  percent: schema.scoreHistory.percent,
  basis: schema.scoreHistory.basis,
  at: schema.scoreHistory.at,
};

export type TrailInput = {
  history: (Pair & { percent: number; basis: FinalBasis | null; at: Date })[];
  /** The counting scores; a pair without one has no trail. */
  finals: (Pair & { percent: number; basis: FinalBasis | null; computedAt: Date })[];
  /** The pairs' attempts (in-progress ones are skipped): attempt 1 is the start without history. */
  attempts: (Pair & {
    number: number;
    percent: number | null;
    submittedAt: Date | null;
    status?: string;
  })[];
};

/** Pure: trails keyed `assignmentId:studentId`, one per counting score. */
export function buildTrails(input: TrailInput): Map<string, ScoreStep[]> {
  const historyBy = new Map<string, TrailInput["history"]>();
  for (const h of input.history) {
    const k = key(h.assignmentId, h.studentId);
    const list = historyBy.get(k);
    if (list) list.push(h);
    else historyBy.set(k, [h]);
  }
  const firstBy = new Map<string, TrailInput["attempts"][number]>();
  for (const a of input.attempts) {
    if (a.status === "in_progress") continue;
    const k = key(a.assignmentId, a.studentId);
    const cur = firstBy.get(k);
    if (!cur || a.number < cur.number) firstBy.set(k, a);
  }
  const out = new Map<string, ScoreStep[]>();
  for (const f of input.finals) {
    const k = key(f.assignmentId, f.studentId);
    const first = firstBy.get(k);
    out.set(
      k,
      scoreTrail({
        history: historyBy.get(k) ?? [],
        first:
          first && first.percent !== null
            ? { percent: first.percent, at: first.submittedAt ?? f.computedAt }
            : null,
        now: { percent: f.percent, basis: f.basis, at: f.computedAt },
      })
    );
  }
  return out;
}

/** Trails keyed `assignmentId:studentId`; a pair with no counting score has none. */
export async function loadScoreTrails(pairs: Pair[]): Promise<Map<string, ScoreStep[]>> {
  if (pairs.length === 0) return new Map();
  const wanted = new Set(pairs.map((p) => key(p.assignmentId, p.studentId)));
  const mine = <T extends Pair>(rows: T[]) =>
    rows.filter((r) => wanted.has(key(r.assignmentId, r.studentId)));
  const assignmentIds = [...new Set(pairs.map((p) => p.assignmentId))];
  const studentIds = [...new Set(pairs.map((p) => p.studentId))];
  const [history, finals, attempts] = await Promise.all([
    db
      .select(scoreHistoryColumns)
      .from(schema.scoreHistory)
      .where(
        and(
          inArray(schema.scoreHistory.assignmentId, assignmentIds),
          inArray(schema.scoreHistory.studentId, studentIds)
        )
      ),
    db
      .select({
        assignmentId: schema.assignmentFinalScores.assignmentId,
        studentId: schema.assignmentFinalScores.studentId,
        percent: schema.assignmentFinalScores.percent,
        basis: schema.assignmentFinalScores.basis,
        computedAt: schema.assignmentFinalScores.computedAt,
      })
      .from(schema.assignmentFinalScores)
      .where(
        and(
          inArray(schema.assignmentFinalScores.assignmentId, assignmentIds),
          inArray(schema.assignmentFinalScores.studentId, studentIds)
        )
      ),
    db
      .select({
        assignmentId: schema.attempts.assignmentId,
        studentId: schema.attempts.studentId,
        number: schema.attempts.number,
        percent: schema.attempts.percent,
        submittedAt: schema.attempts.submittedAt,
      })
      .from(schema.attempts)
      .where(
        and(
          inArray(schema.attempts.assignmentId, assignmentIds),
          inArray(schema.attempts.studentId, studentIds),
          ne(schema.attempts.status, "in_progress")
        )
      ),
  ]);
  return buildTrails({ history: mine(history), finals: mine(finals), attempts: mine(attempts) });
}

export { key as trailKey };
