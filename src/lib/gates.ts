/**
 * Retake gates (PLAN.md §4, Ticket 1.12): one `retake_gates` row per
 * (student, assignment, target) on a summative, recomputed by server code
 * after every relevant event: a submission, a correction, an approval, an
 * opt-in, or (Ticket 1.13) a practice or activity completion. Never written
 * by a client.
 *
 * Per target: corrections_ok = every missed item on the latest attempt that
 * covered the target has an approved correction (always true in a course with
 * CVTC rules, Jon Oct 13 2026). Then relearning (Jon, Oct 19 2026,
 * docs/retake-cycle-plan.md R3): **one** published item tagged to the target,
 * an activity *or* a practice set (the pinned ones when the teacher pinned
 * any), completed **after** the target's corrections were done; or nothing is
 * published for it yet, so the gate cannot block on content that doesn't exist.
 * activity_ok and practice_ok both store that one relearning answer.
 */
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { gateOpen } from "@/lib/retakes";
import { creditsTarget } from "@/lib/worksheet-rules";

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
      cvtcRules: schema.courses.cvtcRules,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .leftJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
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

  // CVTC rules (Jon, Oct 13 2026): corrections are never owed, so that gate is always open.
  const corrections = await correctionsByTarget(
    assignmentId,
    studentId,
    targetIds,
    !!asg.cvtcRules
  );
  // Relearning counts only once corrections are done (Jon, Oct 19 2026: "once they have the
  // corrections completed that should then unlock a relearning activity").
  const since = new Map(
    targetIds.map((id) => {
      const c = corrections.get(id);
      return [id, !c ? new Date(0) : c.ok ? c.doneAt : null] as const;
    })
  );
  const activity = await activitiesByTarget(assignmentId, studentId, targetIds, since);
  const practice = await practiceByTarget(assignmentId, studentId, targetIds, since);

  const now = new Date();
  const rows: GateRow[] = targetIds.map((id) => {
    const p = prior.get(id);
    const a = activity.get(id) ?? { offered: 0, done: false };
    const pr = practice.get(id) ?? { offered: 0, done: false };
    const relearningOk = (a.offered === 0 && pr.offered === 0) || a.done || pr.done;
    const flags = {
      correctionsOk: corrections.get(id)?.ok ?? true,
      activityOk: relearningOk,
      practiceOk: relearningOk,
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

/**
 * Per target: no missed item on the latest attempt covering it lacks an approved correction, and
 * when that became true (the attempt's submission, or the last of those corrections' approval).
 */
async function correctionsByTarget(
  assignmentId: string,
  studentId: string,
  targetIds: string[],
  cvtcRules: boolean
): Promise<Map<string, { ok: boolean; doneAt: Date }>> {
  const attempts = await db
    .select({
      id: schema.attempts.id,
      questionSet: schema.attempts.questionSet,
      submittedAt: schema.attempts.submittedAt,
      startedAt: schema.attempts.startedAt,
    })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, studentId),
        ne(schema.attempts.status, "in_progress")
      )
    )
    .orderBy(desc(schema.attempts.number));
  const out = new Map<string, { ok: boolean; doneAt: Date }>();
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
      reviewedAt: schema.corrections.reviewedAt,
      submittedAt: schema.corrections.submittedAt,
    })
    .from(schema.corrections)
    .where(inArray(schema.corrections.attemptId, attemptIds));
  const rBy = new Map(responses.map((r) => [`${r.attemptId}:${r.questionId}`, r]));
  const approvedAt = new Map(
    corrections
      .filter((c) => c.status === "approved")
      .map((c): [string, Date | null] => [
        `${c.attemptId}:${c.questionId}`,
        c.reviewedAt ?? c.submittedAt,
      ])
  );
  for (const targetId of targetIds) {
    const attempt = attempts.find((a) =>
      a.questionSet.some((s) => s.learningTargetId === targetId)
    );
    if (!attempt) continue;
    let ok = true;
    let doneAt = attempt.submittedAt ?? attempt.startedAt;
    for (const s of attempt.questionSet) {
      if (cvtcRules || s.learningTargetId !== targetId) continue;
      const r = rBy.get(`${attempt.id}:${s.questionId}`);
      const earned = r ? (r.manualScore ?? r.autoScore) : 0;
      const missed = earned !== null && earned < s.points;
      if (!missed) continue;
      const key = `${attempt.id}:${s.questionId}`;
      if (!approvedAt.has(key)) ok = false;
      const at = approvedAt.get(key);
      if (at && at > doneAt) doneAt = at;
    }
    out.set(targetId, { ok, doneAt });
  }
  return out;
}

/** Per target: how many relearning items of one kind are offered, and whether one was done in time. */
type Offered = { offered: number; done: boolean };

/** Credited only when completed at or after `since` (null = corrections not done: nothing counts). */
const inTime = (completedAt: Date | null, since: Date | null | undefined) =>
  !!completedAt && !!since && completedAt >= since;

/** Per target: published activities tagged to it (the pinned ones when pinned), and whether one was completed in time. */
async function activitiesByTarget(
  assignmentId: string,
  studentId: string,
  targetIds: string[],
  since: Map<string, Date | null>
): Promise<Map<string, Offered>> {
  const out = new Map<string, Offered>();
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
      evidence: schema.activityCompletions.evidence,
      completedAt: schema.activityCompletions.completedAt,
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
      out.set(targetId, { offered: 0, done: false });
      continue;
    }
    const pool = candidates.length
      ? candidates
      : pinned.map((id) => ({ activityId: id, requiresVerification: false }));
    out.set(targetId, {
      offered: pool.length,
      done: pool.some((c) => {
        const d = doneBy.get(c.activityId);
        return (
          !!d &&
          (!c.requiresVerification || d.teacherVerified) &&
          creditsTarget(d.evidence?.creditedTargetIds, targetId) &&
          inTime(d.completedAt, since.get(targetId))
        );
      }),
    });
  }
  return out;
}

/** Per target: published practice sets tagged to it (the pinned ones when pinned), and whether one was completed in time. */
async function practiceByTarget(
  assignmentId: string,
  studentId: string,
  targetIds: string[],
  since: Map<string, Date | null>
): Promise<Map<string, Offered>> {
  const out = new Map<string, Offered>();
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
    .select({
      practiceSetId: schema.practiceAttempts.practiceSetId,
      answers: schema.practiceAttempts.answers,
      completedAt: schema.practiceAttempts.completedAt,
    })
    .from(schema.practiceAttempts)
    .where(
      and(
        eq(schema.practiceAttempts.studentId, studentId),
        isNotNull(schema.practiceAttempts.completedAt),
        isNotNull(schema.practiceAttempts.practiceSetId)
      )
    );
  // Worksheet-backed attempts carry the targets their submit credited; ordinary attempts credit every target.
  const creditedBy = new Map<string, { targets: unknown; completedAt: Date | null }[]>();
  for (const d of done)
    if (d.practiceSetId)
      (
        creditedBy.get(d.practiceSetId) ?? creditedBy.set(d.practiceSetId, []).get(d.practiceSetId)!
      ).push({
        targets: (d.answers as { _worksheet?: { creditedTargetIds?: unknown } })._worksheet
          ?.creditedTargetIds,
        completedAt: d.completedAt,
      });
  for (const targetId of targetIds) {
    const pinned = pins.filter((p) => p.learningTargetId === targetId).map((p) => p.practiceSetId!);
    const candidates = pinned.length
      ? pinned
      : tagged.filter((t) => t.learningTargetId === targetId).map((t) => t.practiceSetId);
    out.set(targetId, {
      offered: candidates.length,
      done: candidates.some((id) =>
        (creditedBy.get(id) ?? []).some(
          (c) => creditsTarget(c.targets, targetId) && inTime(c.completedAt, since.get(targetId))
        )
      ),
    });
  }
  return out;
}

/** After a practice or activity completion: every summative the student has a final score on. */
export async function recomputeGatesForStudent(studentId: string): Promise<void> {
  const rows = await db
    .select({ assignmentId: schema.assignmentFinalScores.assignmentId })
    .from(schema.assignmentFinalScores)
    .where(eq(schema.assignmentFinalScores.studentId, studentId));
  for (const r of rows) await recomputeGates(r.assignmentId, studentId);
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
