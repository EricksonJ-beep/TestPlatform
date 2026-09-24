/**
 * Retake reads (Ticket 1.12): a student's per-target retake picture on a
 * summative, for the card, the assignment page, and the start action.
 * Callers pass the guards first.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { recomputeGates } from "@/lib/gates";
import { planRetake, type GateFlags, type RetakePlan } from "@/lib/retakes";

export type RetakeTarget = {
  id: string;
  code: string;
  title: string;
  percent: number;
  required: boolean;
  optedIn: boolean;
  gate: GateFlags & { unlocked: boolean };
};

export type RetakeStatus = {
  targets: RetakeTarget[];
  optionalRetakes: boolean;
  threshold: number;
  plan: RetakePlan;
};

/** null when the assignment isn't a summative or the student has no finished attempt yet. */
export async function getRetakeStatus(
  assignmentId: string,
  studentId: string
): Promise<RetakeStatus | null> {
  const [asg] = await db
    .select({
      type: schema.assessments.type,
      threshold: schema.assignments.retakeThreshold,
      optionalRetakes: schema.assignments.optionalRetakes,
      attemptsAllowed: schema.assignments.attemptsAllowed,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  if (!asg || asg.type !== "summative") return null;
  const final = await db.query.assignmentFinalScores.findFirst({
    where: and(
      eq(schema.assignmentFinalScores.assignmentId, assignmentId),
      eq(schema.assignmentFinalScores.studentId, studentId)
    ),
  });
  if (!final) return null;
  const targetIds = Object.keys(final.perTarget);
  if (targetIds.length === 0) return null;
  const [names, gates, used] = await Promise.all([
    db
      .select({
        id: schema.learningTargets.id,
        code: schema.learningTargets.code,
        title: schema.learningTargets.title,
        sortOrder: schema.learningTargets.sortOrder,
      })
      .from(schema.learningTargets)
      .where(inArray(schema.learningTargets.id, targetIds)),
    db
      .select()
      .from(schema.retakeGates)
      .where(
        and(
          eq(schema.retakeGates.studentId, studentId),
          eq(schema.retakeGates.assignmentId, assignmentId)
        )
      ),
    db.$count(
      schema.attempts,
      and(eq(schema.attempts.assignmentId, assignmentId), eq(schema.attempts.studentId, studentId))
    ),
  ]);
  // Self-heal: a student whose events predate the gate rows gets them computed on first read.
  const gateRows = gates.length ? gates : await recomputeGates(assignmentId, studentId);
  const gateBy = new Map(gateRows.map((g) => [g.learningTargetId, g]));
  const targets: RetakeTarget[] = names
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((t) => {
      const g = gateBy.get(t.id);
      const percent = final.perTarget[t.id].percent;
      return {
        id: t.id,
        code: t.code,
        title: t.title,
        percent,
        required: percent < asg.threshold,
        optedIn: g?.optedIn ?? false,
        gate: {
          correctionsOk: g?.correctionsOk ?? false,
          activityOk: g?.activityOk ?? false,
          practiceOk: g?.practiceOk ?? false,
          unlocked: !!g?.unlockedAt,
        },
      };
    });
  const plan = planRetake({
    targets,
    threshold: asg.threshold,
    optionalRetakes: asg.optionalRetakes,
    attemptsUsed: used,
    attemptsAllowed: asg.attemptsAllowed,
  });
  return { targets, optionalRetakes: asg.optionalRetakes, threshold: asg.threshold, plan };
}
