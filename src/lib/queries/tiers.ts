/**
 * Tier board, relearning monitor, and the dashboard's class-at-a-glance strip
 * (PLAN.md §3.11, Ticket 1.15). Everything derives from what is already
 * stored: final scores (tiers, moves), retake gates, corrections, practice
 * attempts, activity completions. Callers pass the guards first.
 */
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { assignmentStatus, type AssignmentStatus } from "@/lib/assignments";
import { getCorrectionsSummary, latestFinishedAttemptId } from "@/lib/queries/corrections";
import { getRetakeStatus } from "@/lib/queries/retakes";
import {
  movedUp,
  mostMissedTarget,
  readinessLine,
  readinessSortKey,
  readinessState,
  relearningStage,
  stageLabel,
  startOfToday,
  startOfWeek,
  versionStamp,
  type ReadinessState,
  type RelearningStage,
  type TargetReadiness,
} from "@/lib/tiers";

export type BoardTarget = { id: string; code: string; title: string };

export type TierChip = { id: string; code: string; percent: number };

export type TierCard = {
  assignmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  period: string;
  tier: 1 | 2 | 3;
  percent: number;
  movedUpToday: boolean;
  movedUpThisWeek: boolean;
  stage: RelearningStage;
  stageLabel: string;
  required: TierChip[];
  optional: TierChip[];
  readiness: Record<string, ReadinessState>;
  sortKey: number;
};

export type TierBoard = {
  assignment: {
    id: string;
    title: string;
    className: string;
    threshold: number;
    tier2Max: number;
    reviewMode: "auto" | "teacher_approved";
    status: AssignmentStatus;
    closesAt: Date | null;
  };
  periods: { assignmentId: string; className: string }[];
  allPeriods: boolean;
  targets: BoardTarget[];
  cards: TierCard[];
  /** Enrolled students with no finished attempt yet. */
  unscored: { studentId: string; firstName: string; lastName: string; inProgress: boolean }[];
  counts: { 1: number; 2: number; 3: number };
  movedUpThisWeek: number;
  mostMissed: (BoardTarget & { below: number; average: number }) | null;
  version: string;
  generatedAt: Date;
};

async function assessmentTargets(assessmentId: string): Promise<BoardTarget[]> {
  const rows = await db
    .selectDistinct({
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
      sortOrder: schema.learningTargets.sortOrder,
    })
    .from(schema.assessmentSections)
    .innerJoin(
      schema.learningTargets,
      eq(schema.assessmentSections.learningTargetId, schema.learningTargets.id)
    )
    .where(
      and(
        eq(schema.assessmentSections.assessmentId, assessmentId),
        isNotNull(schema.assessmentSections.learningTargetId)
      )
    )
    .orderBy(asc(schema.learningTargets.sortOrder), asc(schema.learningTargets.code));
  return rows.map(({ sortOrder: _s, ...t }) => t);
}

/** The newest change across attempts, corrections, and finals on these assignments. */
async function boardVersion(assignmentIds: string[]): Promise<string> {
  if (assignmentIds.length === 0) return "0";
  const [a] = await db
    .select({ m: sql<string | null>`max(${schema.attempts.updatedAt})` })
    .from(schema.attempts)
    .where(inArray(schema.attempts.assignmentId, assignmentIds));
  const [c] = await db
    .select({ m: sql<string | null>`max(${schema.corrections.updatedAt})` })
    .from(schema.corrections)
    .innerJoin(schema.attempts, eq(schema.corrections.attemptId, schema.attempts.id))
    .where(inArray(schema.attempts.assignmentId, assignmentIds));
  const [f] = await db
    .select({ m: sql<string | null>`max(${schema.assignmentFinalScores.updatedAt})` })
    .from(schema.assignmentFinalScores)
    .where(inArray(schema.assignmentFinalScores.assignmentId, assignmentIds));
  const [g] = await db
    .select({ m: sql<string | null>`max(${schema.retakeGates.updatedAt})` })
    .from(schema.retakeGates)
    .where(inArray(schema.retakeGates.assignmentId, assignmentIds));
  return versionStamp([a?.m, c?.m, f?.m, g?.m]);
}

/**
 * The board for one summative assignment, optionally merged with the same
 * assessment's other periods. Tier = targets below the threshold on the
 * per-target best; stage from corrections and gates; "moved up" from the
 * final score's last tier change.
 */
export async function getTierBoard(
  assignmentId: string,
  opts: { allPeriods?: boolean; now?: Date } = {}
): Promise<TierBoard | null> {
  const now = opts.now ?? new Date();
  const [asg] = await db
    .select({
      id: schema.assignments.id,
      ownerId: schema.assignments.ownerId,
      assessmentId: schema.assignments.assessmentId,
      classId: schema.assignments.classId,
      className: schema.classes.name,
      title: schema.assessments.title,
      type: schema.assessments.type,
      threshold: schema.assignments.retakeThreshold,
      tier2Max: schema.assignments.tier2Max,
      reviewMode: schema.assignments.reviewMode,
      opensAt: schema.assignments.opensAt,
      closesAt: schema.assignments.closesAt,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  if (!asg || asg.type !== "summative") return null;

  const periods = await db
    .select({ assignmentId: schema.assignments.id, className: schema.classes.name })
    .from(schema.assignments)
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .where(
      and(
        eq(schema.assignments.assessmentId, asg.assessmentId),
        eq(schema.assignments.ownerId, asg.ownerId)
      )
    )
    .orderBy(asc(schema.classes.name));
  const included = opts.allPeriods
    ? periods
    : periods.filter((p) => p.assignmentId === assignmentId);
  const includedIds = included.map((p) => p.assignmentId);
  const targets = await assessmentTargets(asg.assessmentId);
  const targetBy = new Map(targets.map((t) => [t.id, t]));

  const cards: TierCard[] = [];
  const unscored: TierBoard["unscored"] = [];
  const finalsForMissed: Record<string, { percent: number }>[] = [];
  const today = startOfToday(now);
  const week = startOfWeek(now);

  for (const period of included) {
    const [classRow] = await db
      .select({ classId: schema.assignments.classId })
      .from(schema.assignments)
      .where(eq(schema.assignments.id, period.assignmentId));
    const roster = await db
      .select({
        studentId: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.enrollments)
      .innerJoin(schema.users, eq(schema.enrollments.studentId, schema.users.id))
      .where(eq(schema.enrollments.classId, classRow.classId))
      .orderBy(asc(schema.users.lastName), asc(schema.users.firstName));
    const finals = await db
      .select()
      .from(schema.assignmentFinalScores)
      .where(eq(schema.assignmentFinalScores.assignmentId, period.assignmentId));
    const finalBy = new Map(finals.map((f) => [f.studentId, f]));
    const attempts = await db
      .select({
        studentId: schema.attempts.studentId,
        status: schema.attempts.status,
        number: schema.attempts.number,
      })
      .from(schema.attempts)
      .where(eq(schema.attempts.assignmentId, period.assignmentId));

    for (const s of roster) {
      const mine = attempts.filter((a) => a.studentId === s.studentId);
      const finished = mine.filter((a) => a.status !== "in_progress").length;
      const inProgress = mine.some((a) => a.status === "in_progress");
      const f = finalBy.get(s.studentId);
      if (!f || f.tier === null || finished === 0) {
        unscored.push({ ...s, inProgress });
        continue;
      }
      finalsForMissed.push(f.perTarget);
      const retake = await getRetakeStatus(period.assignmentId, s.studentId);
      const latest = await latestFinishedAttemptId(period.assignmentId, s.studentId);
      const corrections = latest ? await getCorrectionsSummary(latest) : null;
      const stage = relearningStage({
        tier: f.tier as 1 | 2 | 3,
        attemptsFinished: finished,
        inProgress,
        corrections,
        plan: retake?.plan ?? null,
      });
      const readiness: Record<string, ReadinessState> = {};
      const required: TierChip[] = [];
      const optional: TierChip[] = [];
      for (const t of retake?.targets ?? []) {
        const tr: TargetReadiness = {
          id: t.id,
          code: t.code,
          percent: t.percent,
          required: t.required,
          optedIn: t.optedIn,
          gate: t.gate,
          retaken: false,
        };
        readiness[t.id] = readinessState(tr);
        if (t.required) required.push({ id: t.id, code: t.code, percent: t.percent });
        else if (t.optedIn) optional.push({ id: t.id, code: t.code, percent: t.percent });
      }
      const move = { tier: f.tier, previousTier: f.previousTier, tierChangedAt: f.tierChangedAt };
      cards.push({
        assignmentId: period.assignmentId,
        studentId: s.studentId,
        firstName: s.firstName,
        lastName: s.lastName,
        period: period.className,
        tier: f.tier as 1 | 2 | 3,
        percent: f.percent,
        movedUpToday: movedUp(move, today),
        movedUpThisWeek: movedUp(move, week),
        stage,
        stageLabel: stageLabel(stage, corrections, asg.reviewMode),
        required,
        optional,
        readiness,
        sortKey: readinessSortKey(Object.values(readiness), stage),
      });
    }
  }
  cards.sort((a, b) => a.sortKey - b.sortKey || a.lastName.localeCompare(b.lastName));
  const missed = mostMissedTarget(finalsForMissed, asg.threshold);
  const mostMissed =
    missed && targetBy.get(missed.id) ? { ...targetBy.get(missed.id)!, ...missed } : null;
  return {
    assignment: {
      id: asg.id,
      title: asg.title,
      className: asg.className,
      threshold: asg.threshold,
      tier2Max: asg.tier2Max,
      reviewMode: asg.reviewMode,
      status: assignmentStatus(asg, now),
      closesAt: asg.closesAt,
    },
    periods,
    allPeriods: !!opts.allPeriods,
    targets,
    cards,
    unscored,
    counts: {
      1: cards.filter((c) => c.tier === 1).length,
      2: cards.filter((c) => c.tier === 2).length,
      3: cards.filter((c) => c.tier === 3).length,
    },
    movedUpThisWeek: cards.filter((c) => c.movedUpThisWeek).length,
    mostMissed,
    version: await boardVersion(includedIds),
    generatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Relearning monitor: one student on one assignment
// ---------------------------------------------------------------------------

export type MonitorTarget = TargetReadiness & {
  title: string;
  attempt1Percent: number | null;
  corrections: { needed: number; submitted: number; approved: number; returned: number } | null;
  practice: {
    id: string;
    title: string;
    attempts: number;
    bestPercent: number | null;
    lastActive: Date | null;
    completed: boolean;
    worksheet: boolean;
  }[];
  activities: {
    id: string;
    title: string;
    kind: string;
    completedAt: Date | null;
    teacherVerified: boolean;
    requiresTeacherVerification: boolean;
  }[];
  state: ReadinessState;
  line: string;
};

export type RelearningMonitor = {
  student: { id: string; firstName: string; lastName: string };
  assignment: TierBoard["assignment"];
  tier: 1 | 2 | 3 | null;
  percent: number | null;
  stage: RelearningStage;
  stageLabel: string;
  latestAttemptId: string | null;
  attempts: {
    id: string;
    number: number;
    status: string;
    percent: number | null;
    scopeCodes: string[] | null;
    startedAt: Date;
    submittedAt: Date | null;
    minutes: number | null;
  }[];
  /** Minutes on attempts plus completed practice attempts. */
  minutesOnTask: number;
  targets: MonitorTarget[];
};

export async function getRelearningMonitor(
  assignmentId: string,
  studentId: string
): Promise<RelearningMonitor | null> {
  const board = await getTierBoard(assignmentId);
  if (!board) return null;
  const [student] = await db
    .select({
      id: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .where(eq(schema.users.id, studentId))
    .limit(1);
  if (!student) return null;
  const final = await db.query.assignmentFinalScores.findFirst({
    where: and(
      eq(schema.assignmentFinalScores.assignmentId, assignmentId),
      eq(schema.assignmentFinalScores.studentId, studentId)
    ),
  });
  const attemptRows = await db
    .select()
    .from(schema.attempts)
    .where(
      and(eq(schema.attempts.assignmentId, assignmentId), eq(schema.attempts.studentId, studentId))
    )
    .orderBy(asc(schema.attempts.number));
  const codeBy = new Map(board.targets.map((t) => [t.id, t.code]));
  const attempts = attemptRows.map((a) => ({
    id: a.id,
    number: a.number,
    status: a.status,
    percent: a.percent,
    scopeCodes: a.scope ? a.scope.map((id) => codeBy.get(id) ?? "?") : null,
    startedAt: a.startedAt,
    submittedAt: a.submittedAt,
    minutes: a.submittedAt
      ? Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 60000)
      : null,
  }));
  const attempt1 = attemptRows.find((a) => a.number === 1 && a.status !== "in_progress");
  const attempt1Scores = attempt1
    ? await db
        .select({
          learningTargetId: schema.attemptTargetScores.learningTargetId,
          percent: schema.attemptTargetScores.percent,
        })
        .from(schema.attemptTargetScores)
        .where(eq(schema.attemptTargetScores.attemptId, attempt1.id))
    : [];
  const a1By = new Map(attempt1Scores.map((s) => [s.learningTargetId, s.percent]));

  const retake = await getRetakeStatus(assignmentId, studentId);
  const latest = await latestFinishedAttemptId(assignmentId, studentId);
  const summary = latest ? await getCorrectionsSummary(latest) : null;
  // Corrections per target: needed items on the latest attempt, by the served item's target.
  const corrByTarget = new Map<
    string,
    { needed: number; submitted: number; approved: number; returned: number }
  >();
  if (latest) {
    const attempt = attemptRows.find((a) => a.id === latest)!;
    const { getCorrectionScope } = await import("@/lib/queries/corrections");
    const scope = await getCorrectionScope(latest);
    const rows = await db
      .select({ questionId: schema.corrections.questionId, status: schema.corrections.status })
      .from(schema.corrections)
      .where(eq(schema.corrections.attemptId, latest));
    const statusBy = new Map(rows.map((r) => [r.questionId, r.status]));
    for (const qid of scope?.needed ?? []) {
      const served = attempt.questionSet.find((s) => s.questionId === qid);
      const tid = served?.learningTargetId;
      if (!tid) continue;
      const c = corrByTarget.get(tid) ?? { needed: 0, submitted: 0, approved: 0, returned: 0 };
      c.needed++;
      const st = statusBy.get(qid);
      if (st === "submitted") c.submitted++;
      if (st === "approved") c.approved++;
      if (st === "returned") c.returned++;
      corrByTarget.set(tid, c);
    }
  }

  // Practice and activities tagged to each target, with this student's activity on them.
  const targetIds = board.targets.map((t) => t.id);
  const sets = targetIds.length
    ? await db
        .select({
          id: schema.practiceSets.id,
          title: schema.practiceSets.title,
          worksheetId: schema.practiceSets.worksheetId,
          learningTargetId: schema.practiceSetTargets.learningTargetId,
          attempts: sql<number>`(select count(*)::int from ${schema.practiceAttempts} pa where pa.practice_set_id = ${schema.practiceSets.id} and pa.student_id = ${studentId})`,
          bestPercent: sql<
            number | null
          >`(select max(pa.percent) from ${schema.practiceAttempts} pa where pa.practice_set_id = ${schema.practiceSets.id} and pa.student_id = ${studentId} and pa.completed_at is not null)`,
          lastActive: sql<
            string | null
          >`(select max(greatest(pa.started_at, coalesce(pa.completed_at, pa.started_at))) from ${schema.practiceAttempts} pa where pa.practice_set_id = ${schema.practiceSets.id} and pa.student_id = ${studentId})`,
          completed: sql<boolean>`exists (select 1 from ${schema.practiceAttempts} pa where pa.practice_set_id = ${schema.practiceSets.id} and pa.student_id = ${studentId} and pa.completed_at is not null)`,
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
        )
        .orderBy(asc(schema.practiceSets.sortOrder), asc(schema.practiceSets.title))
    : [];
  const acts = targetIds.length
    ? await db
        .select({
          id: schema.relearningActivities.id,
          title: schema.relearningActivities.title,
          kind: schema.relearningActivities.kind,
          requiresTeacherVerification: schema.relearningActivities.requiresTeacherVerification,
          learningTargetId: schema.activityTargets.learningTargetId,
          completedAt: schema.activityCompletions.completedAt,
          teacherVerified: schema.activityCompletions.teacherVerified,
        })
        .from(schema.activityTargets)
        .innerJoin(
          schema.relearningActivities,
          eq(schema.activityTargets.activityId, schema.relearningActivities.id)
        )
        .leftJoin(
          schema.activityCompletions,
          and(
            eq(schema.activityCompletions.activityId, schema.relearningActivities.id),
            eq(schema.activityCompletions.studentId, studentId)
          )
        )
        .where(
          and(
            inArray(schema.activityTargets.learningTargetId, targetIds),
            eq(schema.relearningActivities.isPublished, true)
          )
        )
        .orderBy(asc(schema.relearningActivities.sortOrder), asc(schema.relearningActivities.title))
    : [];
  const practiceMinutes = await db
    .select({
      m: sql<
        number | null
      >`sum(extract(epoch from (coalesce(${schema.practiceAttempts.completedAt}, ${schema.practiceAttempts.updatedAt}) - ${schema.practiceAttempts.startedAt})) / 60)`,
    })
    .from(schema.practiceAttempts)
    .innerJoin(
      schema.practiceSets,
      eq(schema.practiceAttempts.practiceSetId, schema.practiceSets.id)
    )
    .innerJoin(
      schema.practiceSetTargets,
      eq(schema.practiceSetTargets.practiceSetId, schema.practiceSets.id)
    )
    .where(
      and(
        eq(schema.practiceAttempts.studentId, studentId),
        targetIds.length
          ? inArray(schema.practiceSetTargets.learningTargetId, targetIds)
          : sql`false`
      )
    );

  const retakeBy = new Map((retake?.targets ?? []).map((t) => [t.id, t]));
  const retakenTargets = new Set(
    Object.entries(final?.perTarget ?? {})
      .filter(([, t]) => attemptRows.find((a) => a.id === t.fromAttemptId)?.number !== 1)
      .map(([id]) => id)
  );
  const targets: MonitorTarget[] = board.targets.map((t) => {
    const r = retakeBy.get(t.id);
    const c = corrByTarget.get(t.id) ?? null;
    const practice = sets
      .filter((s) => s.learningTargetId === t.id)
      .map((s) => ({
        id: s.id,
        title: s.title,
        attempts: s.attempts,
        bestPercent: s.bestPercent === null ? null : Number(s.bestPercent),
        lastActive: s.lastActive ? new Date(s.lastActive) : null,
        completed: !!s.completed,
        worksheet: !!s.worksheetId,
      }));
    const activities = acts
      .filter((a) => a.learningTargetId === t.id)
      .map((a) => ({
        id: a.id,
        title: a.title,
        kind: a.kind,
        completedAt: a.completedAt ?? null,
        teacherVerified: !!a.teacherVerified,
        requiresTeacherVerification: a.requiresTeacherVerification,
      }));
    const doneAct = activities.find(
      (a) => a.completedAt && (!a.requiresTeacherVerification || a.teacherVerified)
    );
    const bestPractice = practice
      .filter((p) => p.completed)
      .sort((a, b) => (b.bestPercent ?? 0) - (a.bestPercent ?? 0))[0];
    const tr: TargetReadiness = {
      id: t.id,
      code: t.code,
      percent: r?.percent ?? final?.perTarget[t.id]?.percent ?? 0,
      required: r?.required ?? false,
      optedIn: r?.optedIn ?? false,
      gate: r?.gate ?? {
        correctionsOk: false,
        activityOk: false,
        practiceOk: false,
        unlocked: false,
      },
      retaken: retakenTargets.has(t.id),
      correctionsDetail: c
        ? c.approved === c.needed
          ? `${c.approved} of ${c.needed} approved`
          : c.returned
            ? "returned"
            : c.submitted + c.approved > 0
              ? `${c.submitted + c.approved} of ${c.needed} submitted`
              : `0 of ${c.needed}`
        : null,
      activityDetail: doneAct
        ? `${doneAct.kind === "video" ? "watched" : "did"} ${doneAct.title}`
        : activities.length
          ? `0 of ${activities.length}`
          : null,
      practiceDetail: bestPractice
        ? bestPractice.bestPercent === null
          ? `done ${bestPractice.title}`
          : `best ${Math.round(bestPractice.bestPercent)}%`
        : practice.length
          ? `0 of ${practice.length}`
          : null,
    };
    return {
      ...tr,
      title: t.title,
      attempt1Percent: a1By.get(t.id) ?? null,
      corrections: c,
      practice,
      activities,
      state: readinessState(tr),
      line: readinessLine(tr),
    };
  });
  const finished = attemptRows.filter((a) => a.status !== "in_progress").length;
  const stage = relearningStage({
    tier: (final?.tier as 1 | 2 | 3 | null) ?? null,
    attemptsFinished: finished,
    inProgress: attemptRows.some((a) => a.status === "in_progress"),
    corrections: summary,
    plan: retake?.plan ?? null,
  });
  const attemptMinutes = attempts.reduce((n, a) => n + (a.minutes ?? 0), 0);
  return {
    student,
    assignment: board.assignment,
    tier: (final?.tier as 1 | 2 | 3 | null) ?? null,
    percent: final?.percent ?? null,
    stage,
    stageLabel: stageLabel(stage, summary, board.assignment.reviewMode),
    latestAttemptId: latest,
    attempts,
    minutesOnTask: attemptMinutes + Math.round(Number(practiceMinutes[0]?.m ?? 0)),
    targets,
  };
}

// ---------------------------------------------------------------------------
// Dashboard: class at a glance
// ---------------------------------------------------------------------------

export type GlanceRow = {
  assignmentId: string;
  title: string;
  className: string;
  status: AssignmentStatus;
  counts: { 1: number; 2: number; 3: number };
  unscored: number;
  movedUpThisWeek: number;
};

/** Summatives the teacher owns that have any final score, newest first, for the dashboard strip. */
export async function getClassGlance(teacherId: string, limit = 6): Promise<GlanceRow[]> {
  const now = new Date();
  const asgs = await db
    .select({
      id: schema.assignments.id,
      title: schema.assessments.title,
      className: schema.classes.name,
      opensAt: schema.assignments.opensAt,
      closesAt: schema.assignments.closesAt,
      enrolled: sql<number>`(select count(*)::int from ${schema.enrollments} e where e.class_id = ${schema.assignments.classId})`,
      scored: sql<number>`(select count(*)::int from ${schema.assignmentFinalScores} f where f.assignment_id = ${schema.assignments.id} and f.tier is not null)`,
      t1: sql<number>`(select count(*)::int from ${schema.assignmentFinalScores} f where f.assignment_id = ${schema.assignments.id} and f.tier = 1)`,
      t2: sql<number>`(select count(*)::int from ${schema.assignmentFinalScores} f where f.assignment_id = ${schema.assignments.id} and f.tier = 2)`,
      t3: sql<number>`(select count(*)::int from ${schema.assignmentFinalScores} f where f.assignment_id = ${schema.assignments.id} and f.tier = 3)`,
      moved: sql<number>`(select count(*)::int from ${schema.assignmentFinalScores} f where f.assignment_id = ${schema.assignments.id} and f.previous_tier is not null and f.tier < f.previous_tier and f.tier_changed_at >= ${startOfWeek(now)})`,
      latest: sql<
        string | null
      >`(select max(f.updated_at) from ${schema.assignmentFinalScores} f where f.assignment_id = ${schema.assignments.id})`,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .where(and(eq(schema.assignments.ownerId, teacherId), eq(schema.assessments.type, "summative")))
    .orderBy(desc(schema.assignments.createdAt));
  return asgs
    .filter((a) => a.scored > 0)
    .sort((a, b) => Date.parse(b.latest ?? "0") - Date.parse(a.latest ?? "0"))
    .slice(0, limit)
    .map((a) => ({
      assignmentId: a.id,
      title: a.title,
      className: a.className,
      status: assignmentStatus(a, now),
      counts: { 1: a.t1, 2: a.t2, 3: a.t3 },
      unscored: Math.max(0, a.enrolled - a.scored),
      movedUpThisWeek: a.moved,
    }));
}
