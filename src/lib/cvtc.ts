/**
 * CVTC rules (Jon, Oct 13 2026, dashboard plan decision 3: "corrections earn no credit, retakes
 * only"): the recompute that follows the course switch, and the settle that runs after a deploy.
 * The rule lives on the assessment's course, so a shared test assigned by another teacher follows
 * it as it follows the test's questions and settings; the recompute covers those assignments too,
 * so a stored score never disagrees with the rule every page reads. Callers pass the guards first
 * (the deploy script has none to pass: it only recomputes stored scores to match stored rules).
 */
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { recomputeFinalScore } from "@/lib/attempts";
import { recomputeGates } from "@/lib/gates";

/** Pairs recomputed at once: enough to finish a whole course in seconds, few enough for the database. */
const BATCH = 8;

async function inBatches<T>(items: T[], fn: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH)
    await Promise.all(items.slice(i, i + BATCH).map(fn));
}

/**
 * Rule: recompute only what the switch can change on the course's assignments. A capped formative's
 * counting score (the corrections lift and its basis come and go with the rules) is recomputed,
 * which reruns its gates; a summative's relearning gates are recomputed (the corrections gate opens
 * or shuts; its counting score never reads corrections); practice and uncapped formatives can't
 * change and are skipped. A few pairs at a time. Re-running it is safe and finishes the job if an
 * earlier run stopped part way. Returns how many student × test pairs it recomputed.
 */
export async function recomputeCourseRules(courseId: string): Promise<number> {
  const pairs = await db
    .selectDistinct({
      assignmentId: schema.attempts.assignmentId,
      studentId: schema.attempts.studentId,
      type: schema.assessments.type,
    })
    .from(schema.attempts)
    .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .where(
      and(
        eq(schema.assessments.courseId, courseId),
        ne(schema.attempts.status, "in_progress"),
        or(
          eq(schema.assessments.type, "summative"),
          and(eq(schema.assessments.type, "formative"), eq(schema.assignments.correctionsCap, true))
        )
      )
    );
  await inBatches(pairs, (p) =>
    p.type === "summative"
      ? recomputeGates(p.assignmentId, p.studentId)
      : recomputeFinalScore(p.assignmentId, p.studentId)
  );
  return pairs.length;
}

/**
 * After a deploy: every counting score in a course with CVTC rules on that still carries a
 * corrections lift (basis `corrections_to_threshold` / `corrections_to_full`, earned before the
 * rules came on, as migration 0027 turned them on without recomputing) is recomputed now, rather
 * than dropping later at some unrelated event like a retake submit. Cheap to run on every deploy:
 * a recomputed score no longer carries that basis, so the next run finds nothing.
 */
export async function settleCvtcLeftovers(): Promise<number> {
  const rows = await db
    .select({
      assignmentId: schema.assignmentFinalScores.assignmentId,
      studentId: schema.assignmentFinalScores.studentId,
    })
    .from(schema.assignmentFinalScores)
    .innerJoin(
      schema.assignments,
      eq(schema.assignmentFinalScores.assignmentId, schema.assignments.id)
    )
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
    .where(
      and(
        eq(schema.courses.cvtcRules, true),
        inArray(schema.assignmentFinalScores.basis, [
          "corrections_to_threshold",
          "corrections_to_full",
        ])
      )
    );
  await inBatches(rows, (r) => recomputeFinalScore(r.assignmentId, r.studentId));
  return rows.length;
}
