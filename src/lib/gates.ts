/**
 * Retake gates (PLAN.md §4, Ticket 1.12): one `retake_gates` row per
 * (student, assignment, target) on a summative, recomputed by server code
 * after every relevant event: a submission, a correction, an approval, an
 * opt-in, or (Ticket 1.13) a practice or activity completion. Never written
 * by a client.
 *
 * Per target: corrections_ok = every missed item on the latest attempt that
 * covered the target has an approved correction; activity_ok / practice_ok =
 * the student completed a published item tagged to the target (the pinned one
 * when the teacher pinned one), or nothing is published for it yet, so the
 * gate cannot block on content that doesn't exist.
 */
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { gateOpen } from "@/lib/retakes";

export type GateRow = {
  learningTargetId: string;
  required: boolean;
  optedIn: boolean;
  correctionsOk: boolean;
  activityOk: boolean;
  practiceOk: boolean;
  unlockedAt: Date | null;
};

export async function recomputeGates(assignmentId: string, studentId: string): Promise<GateRow[]> {
  const [asg] = await db
    .select({
      type: schema.assessments.type,
      threshold: schema.assignments.retakeThreshold,
      courseId: schema.assessments.courseId,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  if (!asg || asg.type !== "summative") return [];
  const final = await db.query.assignmentFinalScores.findFirst({
    where: and(
      eq(schema.assignmentFinalScores.assignmentId, assignmentId),
      eq(schema.assignmentFinalScores.studentId, studentId)
    ),
  });
  if (!final) return [];
  const targetIds = Object.keys(final.perTarget);
  if (targetIds.length === 0) return [];

  const existing = await db
    .select()
    .from(schema.retakeGates)
    .where(
      and(
        eq(schema.retakeGates.studentId, studentId),
        eq(schema.retakeGates.assignmentId, assignmentId)
      )
    );
  const prior = new Map(existing.map((g) => [g.learningTargetId, g]));

  const correctionsOk = await correctionsByTarget(assignmentId, studentId, targetIds);
  const activityOk = await activitiesByTarget(assignmentId, studentId, targetIds);
  const practiceOk = await practiceByTarget(assignmentId, studentId, targetIds);

  const now = new Date();
  const rows: GateRow[] = targetIds.map((id) => {
    const p = prior.get(id);
    const flags = {
      correctionsOk: correctionsOk.get(id) ?? true,
      activityOk: activityOk.get(id) ?? true,
      practiceOk: practiceOk.get(id) ?? true,
    };
    const required = final.perTarget[id].percent < asg.threshold;
    const optedIn = p?.optedIn ?? false;
    const open = (required || optedIn) && gateOpen(flags);
    return {
      learningTargetId: id,
      required,
      optedIn,
      ...flags,
      unlockedAt: open ? (p?.unlockedAt ?? now) : null,
    };
  });
  for (const r of rows) {
    await db
      .insert(schema.retakeGates)
      .values({ studentId, assignmentId, ...r })
      .onConflictDoUpdate({
        target: [
          schema.retakeGates.studentId,
          schema.retakeGates.assignmentId,
          schema.retakeGates.learningTargetId,
        ],
        set: {
          required: r.required,
          correctionsOk: r.correctionsOk,
          activityOk: r.activityOk,
          practiceOk: r.practiceOk,
          unlockedAt: r.unlockedAt,
        },
      });
  }
  return rows;
}

/** Per target: no missed item on the latest attempt covering it lacks an approved correction. */
async function correctionsByTarget(
  assignmentId: string,
  studentId: string,
  targetIds: string[]
): Promise<Map<string, boolean>> {
  const attempts = await db
    .select({ id: schema.attempts.id, questionSet: schema.attempts.questionSet })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, studentId),
        ne(schema.attempts.status, "in_progress")
      )
    )
    .orderBy(desc(schema.attempts.number));
  const out = new Map<string, boolean>();
  if (attempts.length === 0) return out;
  const attemptIds = attempts.map((a) => a.id);
  const responses = await db
    .select({
      attemptId: schema.responses.attemptId,
      questionId: schema.responses.questionId,
      autoScore: schema.responses.autoScore,
      manualScore: schema.responses.manualScore,
    })
    .from(schema.responses)
    .where(inArray(schema.responses.attemptId, attemptIds));
  const corrections = await db
    .select({
      attemptId: schema.corrections.attemptId,
      questionId: schema.corrections.questionId,
      status: schema.corrections.status,
    })
    .from(schema.corrections)
    .where(inArray(schema.corrections.attemptId, attemptIds));
  const rBy = new Map(responses.map((r) => [`${r.attemptId}:${r.questionId}`, r]));
  const approved = new Set(
    corrections.filter((c) => c.status === "approved").map((c) => `${c.attemptId}:${c.questionId}`)
  );
  for (const targetId of targetIds) {
    const attempt = attempts.find((a) =>
      a.questionSet.some((s) => s.learningTargetId === targetId)
    );
    if (!attempt) continue;
    let ok = true;
    for (const s of attempt.questionSet) {
      if (s.learningTargetId !== targetId) continue;
      const r = rBy.get(`${attempt.id}:${s.questionId}`);
      const earned = r ? (r.manualScore ?? r.autoScore) : 0;
      const missed = earned !== null && earned < s.points;
      if (missed && !approved.has(`${attempt.id}:${s.questionId}`)) ok = false;
    }
    out.set(targetId, ok);
  }
  return out;
}

/** Per target: a completed published activity tagged to it (the pinned one when pinned); true when none is published. */
async function activitiesByTarget(
  assignmentId: string,
  studentId: string,
  targetIds: string[]
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const tagged = await db
    .select({
      activityId: schema.activityTargets.activityId,
      learningTargetId: schema.activityTargets.learningTargetId,
      requiresVerification: schema.relearningActivities.requiresTeacherVerification,
    })
    .from(schema.activityTargets)
    .innerJoin(
      schema.relearningActivities,
      eq(schema.activityTargets.activityId, schema.relearningActivities.id)
    )
    .where(
      and(
        inArray(schema.activityTargets.learningTargetId, targetIds),
        eq(schema.relearningActivities.isPublished, true)
      )
    );
  const pins = await db
    .select({
      learningTargetId: schema.assignmentPins.learningTargetId,
      activityId: schema.assignmentPins.activityId,
    })
    .from(schema.assignmentPins)
    .where(
      and(
        eq(schema.assignmentPins.assignmentId, assignmentId),
        isNotNull(schema.assignmentPins.activityId)
      )
    );
  const done = await db
    .select({
      activityId: schema.activityCompletions.activityId,
      teacherVerified: schema.activityCompletions.teacherVerified,
    })
    .from(schema.activityCompletions)
    .where(eq(schema.activityCompletions.studentId, studentId));
  const doneBy = new Map(done.map((d) => [d.activityId, d]));
  for (const targetId of targetIds) {
    const pinned = pins.filter((p) => p.learningTargetId === targetId).map((p) => p.activityId!);
    const candidates = pinned.length
      ? tagged.filter((t) => pinned.includes(t.activityId))
      : tagged.filter((t) => t.learningTargetId === targetId);
    if (candidates.length === 0 && pinned.length === 0) {
      out.set(targetId, true);
      continue;
    }
    const pool = candidates.length
      ? candidates
      : pinned.map((id) => ({ activityId: id, requiresVerification: false }));
    out.set(
      targetId,
      pool.some((c) => {
        const d = doneBy.get(c.activityId);
        return !!d && (!c.requiresVerification || d.teacherVerified);
      })
    );
  }
  return out;
}

/** Per target: a completed attempt on a published practice set tagged to it (the pinned one when pinned); true when none is published. */
async function practiceByTarget(
  assignmentId: string,
  studentId: string,
  targetIds: string[]
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const tagged = await db
    .select({
      practiceSetId: schema.practiceSetTargets.practiceSetId,
      learningTargetId: schema.practiceSetTargets.learningTargetId,
    })
    .from(schema.practiceSetTargets)
    .innerJoin(
      schema.practiceSets,
      eq(schema.practiceSetTargets.practiceSetId, schema.practiceSets.id)
    )
    .where(
      and(
        inArray(schema.practiceSetTargets.learningTargetId, targetIds),
        eq(schema.practiceSets.isPublished, true)
      )
    );
  const pins = await db
    .select({
      learningTargetId: schema.assignmentPins.learningTargetId,
      practiceSetId: schema.assignmentPins.practiceSetId,
    })
    .from(schema.assignmentPins)
    .where(
      and(
        eq(schema.assignmentPins.assignmentId, assignmentId),
        isNotNull(schema.assignmentPins.practiceSetId)
      )
    );
  const done = await db
    .select({ practiceSetId: schema.practiceAttempts.practiceSetId })
    .from(schema.practiceAttempts)
    .where(
      and(
        eq(schema.practiceAttempts.studentId, studentId),
        isNotNull(schema.practiceAttempts.completedAt)
      )
    );
  const doneSet = new Set(done.map((d) => d.practiceSetId));
  for (const targetId of targetIds) {
    const pinned = pins.filter((p) => p.learningTargetId === targetId).map((p) => p.practiceSetId!);
    const candidates = pinned.length
      ? pinned
      : tagged.filter((t) => t.learningTargetId === targetId).map((t) => t.practiceSetId);
    out.set(targetId, candidates.length === 0 ? true : candidates.some((id) => doneSet.has(id)));
  }
  return out;
}

/** Student opts in or out of retaking a target that is already proficient. */
export async function setOptIn(
  assignmentId: string,
  studentId: string,
  learningTargetId: string,
  optedIn: boolean
): Promise<void> {
  await db
    .insert(schema.retakeGates)
    .values({ studentId, assignmentId, learningTargetId, optedIn })
    .onConflictDoUpdate({
      target: [
        schema.retakeGates.studentId,
        schema.retakeGates.assignmentId,
        schema.retakeGates.learningTargetId,
      ],
      set: { optedIn },
    });
  await recomputeGates(assignmentId, studentId);
}
