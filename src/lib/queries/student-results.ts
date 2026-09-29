/**
 * The student's "My results" tab (PLAN.md §5 screen 6): per assignment, every
 * attempt, the one that counts, per-target percents, corrections, and growth.
 * Nothing here is shown until the assignment's results are released. Callers
 * pass the guard first.
 */
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { StudentAssignment } from "@/lib/queries/assignments";

export type StudentResult = {
  assignmentId: string;
  title: string;
  className: string;
  type: "practice" | "formative" | "summative";
  released: boolean;
  bestPercent: number | null;
  bestAttemptId: string | null;
  /** Percent points from attempt 1 to the score that counts; null with fewer than two attempts. */
  growth: number | null;
  targets: { id: string; code: string; title: string; percent: number }[];
  attempts: {
    id: string;
    number: number;
    percent: number | null;
    submittedAt: Date | null;
    scopeCodes: string[] | null;
    pending: boolean;
  }[];
  corrections: StudentAssignment["corrections"];
};

export async function listStudentResults(
  studentId: string,
  assignments: StudentAssignment[]
): Promise<StudentResult[]> {
  const withWork = assignments.filter((a) => a.attemptsUsed > 0);
  if (withWork.length === 0) return [];
  const ids = withWork.map((a) => a.id);
  const attempts = await db
    .select({
      id: schema.attempts.id,
      assignmentId: schema.attempts.assignmentId,
      number: schema.attempts.number,
      status: schema.attempts.status,
      percent: schema.attempts.percent,
      submittedAt: schema.attempts.submittedAt,
      scope: schema.attempts.scope,
    })
    .from(schema.attempts)
    .where(
      and(inArray(schema.attempts.assignmentId, ids), eq(schema.attempts.studentId, studentId))
    )
    .orderBy(asc(schema.attempts.number));
  const finals = await db
    .select()
    .from(schema.assignmentFinalScores)
    .where(
      and(
        inArray(schema.assignmentFinalScores.assignmentId, ids),
        eq(schema.assignmentFinalScores.studentId, studentId)
      )
    );
  const targetIds = [...new Set(finals.flatMap((f) => Object.keys(f.perTarget)))];
  const scopeIds = [...new Set(attempts.flatMap((a) => a.scope ?? []))];
  const allIds = [...new Set([...targetIds, ...scopeIds])];
  const targets = allIds.length
    ? await db
        .select({
          id: schema.learningTargets.id,
          code: schema.learningTargets.code,
          title: schema.learningTargets.title,
          sortOrder: schema.learningTargets.sortOrder,
        })
        .from(schema.learningTargets)
        .where(inArray(schema.learningTargets.id, allIds))
    : [];
  const targetBy = new Map(targets.map((t) => [t.id, t]));
  // Formatives: the best attempt's per-target scores; summatives: the stored per-target best.
  const bestFormativeIds = finals
    .filter((f) => f.tier === null)
    .map(
      (f) =>
        attempts.find(
          (a) =>
            a.assignmentId === f.assignmentId &&
            a.percent === finals.find((x) => x.assignmentId === f.assignmentId)?.percent
        )?.id
    )
    .filter((x): x is string => !!x);
  const formativeTargets = bestFormativeIds.length
    ? await db
        .select({
          attemptId: schema.attemptTargetScores.attemptId,
          learningTargetId: schema.attemptTargetScores.learningTargetId,
          percent: schema.attemptTargetScores.percent,
        })
        .from(schema.attemptTargetScores)
        .where(inArray(schema.attemptTargetScores.attemptId, bestFormativeIds))
    : [];

  return withWork.map((a) => {
    const mine = attempts.filter((x) => x.assignmentId === a.id);
    const finished = mine.filter((x) => x.status !== "in_progress");
    const final = finals.find((f) => f.assignmentId === a.id) ?? null;
    let bestAttemptId: string | null = null;
    let targetRows: StudentResult["targets"] = [];
    if (final && a.type === "summative") {
      targetRows = Object.entries(final.perTarget)
        .map(([id, t]) => ({
          id,
          code: targetBy.get(id)?.code ?? "?",
          title: targetBy.get(id)?.title ?? "",
          percent: t.percent,
          sortOrder: targetBy.get(id)?.sortOrder ?? 0,
        }))
        .sort((x, y) => x.sortOrder - y.sortOrder || x.code.localeCompare(y.code))
        .map(({ sortOrder: _s, ...t }) => t);
      bestAttemptId =
        finished.reduce<(typeof finished)[number] | null>(
          (b, x) => (b === null || (x.percent ?? 0) > (b.percent ?? 0) ? x : b),
          null
        )?.id ?? null;
    } else if (final) {
      const best = finished.reduce<(typeof finished)[number] | null>(
        (b, x) => (b === null || (x.percent ?? 0) > (b.percent ?? 0) ? x : b),
        null
      );
      bestAttemptId = best?.id ?? null;
      targetRows = formativeTargets
        .filter((t) => t.attemptId === bestAttemptId)
        .map((t) => ({
          id: t.learningTargetId,
          code: targetBy.get(t.learningTargetId)?.code ?? "?",
          title: targetBy.get(t.learningTargetId)?.title ?? "",
          percent: t.percent,
        }));
    }
    const first = finished.find((x) => x.number === 1);
    const bestPercent = final?.percent ?? null;
    return {
      assignmentId: a.id,
      title: a.title,
      className: a.className,
      type: a.type,
      released: a.resultsReleased,
      bestPercent,
      bestAttemptId,
      growth:
        first && finished.length > 1 && bestPercent !== null && first.percent !== null
          ? bestPercent - first.percent
          : null,
      targets: targetRows,
      attempts: mine.map((x) => ({
        id: x.id,
        number: x.number,
        percent: x.percent,
        submittedAt: x.submittedAt,
        scopeCodes: x.scope ? x.scope.map((id) => targetBy.get(id)?.code ?? "?") : null,
        pending: x.status === "submitted",
      })),
      corrections: a.corrections,
    };
  });
}

void ne;
