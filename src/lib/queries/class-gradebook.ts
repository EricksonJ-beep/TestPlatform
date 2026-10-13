/**
 * The class gradebook read (Jon, Oct 13 2026: "a complete gradebook view for the class so I can
 * see who needs to take what without having to go into each assessment"; docs/dashboard-plan.md
 * build step 3). Every enrolled student × every assignment of the class (a class is one term's
 * section, so that is this term's tests), each cell carrying the student's own card state
 * (`deriveCardState`, the rule the student home uses, so a cell and the card always agree) and
 * the teacher's status tag on top (`cellTag`).
 *
 * Batched: ten queries in two waves whatever the class size. Nothing is written: stored gate rows
 * are read as they are (`getRetakeStatus` can write them during a read, so it is never called
 * here), and paused tests are worked out in code (`currentPause`). Callers pass
 * requireOwner({ type: "class" }) first.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import type { FinalBasis, PerTargetBest } from "@/db/schema";
import type { CorrectionStatus } from "@/db/types";
import { assignmentStatus, type AssignmentStatus } from "@/lib/assignments";
import { deriveCardState, type StudentCardState } from "@/lib/card-state";
import { cellTag, columnFooter, type CellTag, type ColumnFooter } from "@/lib/class-gradebook";
import {
  correctableItems,
  questionsNeedingCorrection,
  summarizeSet,
  type SetSummary,
} from "@/lib/corrections";
import { correctionsCapOn } from "@/lib/grading";
import { requestBlocker, staleRequest, type RequestBlocker } from "@/lib/needs-you";
import { currentPause } from "@/lib/pause";
import {
  planRetake,
  retakeTargets,
  type CorrectionsRule,
  type CycleState,
  type RetakePlan,
  type RetakeTarget,
} from "@/lib/retakes";
import { movedUp, startOfWeek } from "@/lib/tiers";

export type ClassGradebookColumn = {
  assignmentId: string;
  assessmentId: string;
  title: string;
  type: "practice" | "formative" | "summative";
  opensAt: Date | null;
  closesAt: Date | null;
  status: AssignmentStatus;
  attemptsAllowed: number | null;
  threshold: number;
  reviewMode: "auto" | "teacher_approved";
  retakesNeedUnlock: boolean;
  /** The corrections cap as it applies (`correctionsCapOn`: never in a CVTC course). */
  correctionsCap: boolean;
  cvtcRules: boolean;
  footer: ColumnFooter;
};

export type ClassGradebookAttempt = {
  id: string;
  number: number;
  status: "in_progress" | "submitted" | "graded";
  percent: number | null;
  startedAt: Date;
  submittedAt: Date | null;
  tabSwitches: number;
  /** Written answers on it still waiting for a score. */
  pendingManual: number;
  /** An open attempt that is paused, stored or worked out (`currentPause`). */
  paused: boolean;
  /** Target codes a targeted retake covered; null for a full attempt. */
  scopeCodes: string[] | null;
};

export type ClassGradebookCell = {
  assignmentId: string;
  studentId: string;
  /** What the student's own card shows for this test (`deriveCardState`). */
  card: StudentCardState;
  /** The learning cycle, worked out even after the test closed; null before any attempt or while one is open. */
  cycle: CycleState | null;
  rule: CorrectionsRule;
  /** The teacher's status tag (`cellTag`; words from `tagLabel`). */
  tag: CellTag;
  /** The counting score from `assignment_final_scores` (tier on summatives) and how it came about. */
  score: { percent: number; tier: 1 | 2 | 3 | null; basis: FinalBasis | null } | null;
  attemptsUsed: number;
  attempts: ClassGradebookAttempt[];
  /** The open attempt (for Let them continue). */
  openAttemptId: string | null;
  latestAttemptId: string | null;
  /** The latest finished attempt's corrections set; null when nothing is in scope. */
  corrections: (SetSummary & { attemptId: string; attemptNumber: number }) | null;
  /** Summatives: per-target retake picture from the stored gate rows; null otherwise. */
  retake: { targets: RetakeTarget[]; plan: RetakePlan } | null;
  /** Under the cap: the last moment a retake may start. */
  retakeBy: Date | null;
  /** Most tab switches on any attempt. */
  tabSwitches: number;
  /** Summatives: the last tier change, since Monday, was up. */
  movedUpThisWeek: boolean;
};

export type ClassGradebook = {
  class: {
    id: string;
    name: string;
    period: string | null;
    term: string | null;
    courseId: string | null;
    courseName: string | null;
  };
  students: { id: string; firstName: string; lastName: string }[];
  /** Newest first (by open date, else when assigned), every type; the page hides practice by default. */
  columns: ClassGradebookColumn[];
  /** One row per student, cells in column order. */
  rows: {
    student: { id: string; firstName: string; lastName: string };
    cells: ClassGradebookCell[];
  }[];
  generatedAt: Date;
};

const pairKey = (assignmentId: string, studentId: string) => `${assignmentId}:${studentId}`;
/** A json aggregate as an object, whether the driver parsed it already or handed back text. */
const fromJson = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
type ScoreJson = { questionId: string; autoScore: number | null; manualScore: number | null };
type CorrectionJson = { questionId: string; status: CorrectionStatus; reviewerNote: string | null };

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/**
 * Every student × every assignment of the class (Jon, Oct 13 2026, decisions 1, 7, 9): the
 * counting score, the student's card state and the teacher's tag, with column footers (done /
 * enrolled, average counting score, tier counts, up N this week). Null when the class doesn't
 * exist. Reads only.
 */
export async function getClassGradebook(
  classId: string,
  now = new Date()
): Promise<ClassGradebook | null> {
  const classAssignments = db
    .select({ id: schema.assignments.id })
    .from(schema.assignments)
    .where(eq(schema.assignments.classId, classId));
  const classStudents = db
    .select({ id: schema.enrollments.studentId })
    .from(schema.enrollments)
    .where(eq(schema.enrollments.classId, classId));
  const assessmentCourse = alias(schema.courses, "assessment_course");

  // Wave 1: everything that hangs off the class id.
  const [classRows, roster, assignments, attempts, finals, gates, unlocks, targets, pending] =
    await Promise.all([
      db
        .select({
          id: schema.classes.id,
          name: schema.classes.name,
          period: schema.classes.period,
          term: schema.classes.term,
          courseId: schema.classes.courseId,
          courseName: schema.courses.name,
        })
        .from(schema.classes)
        .leftJoin(schema.courses, eq(schema.classes.courseId, schema.courses.id))
        .where(eq(schema.classes.id, classId))
        .limit(1),
      db
        .select({
          id: schema.users.id,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
        })
        .from(schema.enrollments)
        .innerJoin(schema.users, eq(schema.enrollments.studentId, schema.users.id))
        .where(eq(schema.enrollments.classId, classId))
        .orderBy(asc(schema.users.lastName), asc(schema.users.firstName)),
      db
        .select({
          id: schema.assignments.id,
          assessmentId: schema.assignments.assessmentId,
          title: schema.assessments.title,
          type: schema.assessments.type,
          opensAt: schema.assignments.opensAt,
          closesAt: schema.assignments.closesAt,
          attemptsAllowed: schema.assignments.attemptsAllowed,
          reviewMode: schema.assignments.reviewMode,
          retakeThreshold: schema.assignments.retakeThreshold,
          optionalRetakes: schema.assignments.optionalRetakes,
          retakeWaitHours: schema.assignments.retakeWaitHours,
          retakesNeedUnlock: schema.assignments.retakesNeedUnlock,
          correctionsCap: schema.assignments.correctionsCap,
          retakeWindowDays: schema.assignments.retakeWindowDays,
          cvtcRules: assessmentCourse.cvtcRules,
        })
        .from(schema.assignments)
        .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
        .leftJoin(assessmentCourse, eq(schema.assessments.courseId, assessmentCourse.id))
        .where(eq(schema.assignments.classId, classId))
        .orderBy(
          desc(sql`coalesce(${schema.assignments.opensAt}, ${schema.assignments.createdAt})`),
          asc(schema.assessments.title)
        ),
      db
        .select({
          id: schema.attempts.id,
          assignmentId: schema.attempts.assignmentId,
          studentId: schema.attempts.studentId,
          number: schema.attempts.number,
          status: schema.attempts.status,
          percent: schema.attempts.percent,
          scope: schema.attempts.scope,
          startedAt: schema.attempts.startedAt,
          submittedAt: schema.attempts.submittedAt,
          dueAt: schema.attempts.dueAt,
          pausedAt: schema.attempts.pausedAt,
          pauseReason: schema.attempts.pauseReason,
          lastActiveAt: schema.attempts.lastActiveAt,
          resumeRequestedAt: schema.attempts.resumeRequestedAt,
          tabSwitches: schema.attempts.tabSwitches,
          total: sql<number>`jsonb_array_length(${schema.attempts.questionSet})`,
          answered: sql<number>`(select count(*)::int from ${schema.responses} r where r.attempt_id = attempts.id and r.answer is not null)`,
          pendingManual: sql<number>`(select count(*)::int from ${schema.responses} r where r.attempt_id = attempts.id and r.auto_score is null and r.manual_score is null)`,
          correctionsToCheck: sql<number>`(select count(*)::int from ${schema.corrections} c where c.attempt_id = attempts.id and c.status = 'submitted')`,
        })
        .from(schema.attempts)
        .where(
          and(
            inArray(schema.attempts.assignmentId, classAssignments),
            inArray(schema.attempts.studentId, classStudents)
          )
        )
        .orderBy(asc(schema.attempts.number)),
      db
        .select({
          assignmentId: schema.assignmentFinalScores.assignmentId,
          studentId: schema.assignmentFinalScores.studentId,
          percent: schema.assignmentFinalScores.percent,
          tier: schema.assignmentFinalScores.tier,
          previousTier: schema.assignmentFinalScores.previousTier,
          tierChangedAt: schema.assignmentFinalScores.tierChangedAt,
          perTarget: schema.assignmentFinalScores.perTarget,
          basis: schema.assignmentFinalScores.basis,
        })
        .from(schema.assignmentFinalScores)
        .where(
          and(
            inArray(schema.assignmentFinalScores.assignmentId, classAssignments),
            inArray(schema.assignmentFinalScores.studentId, classStudents)
          )
        ),
      db
        .select({
          assignmentId: schema.retakeGates.assignmentId,
          studentId: schema.retakeGates.studentId,
          learningTargetId: schema.retakeGates.learningTargetId,
          optedIn: schema.retakeGates.optedIn,
          correctionsOk: schema.retakeGates.correctionsOk,
          activityOk: schema.retakeGates.activityOk,
          practiceOk: schema.retakeGates.practiceOk,
          unlockedAt: schema.retakeGates.unlockedAt,
        })
        .from(schema.retakeGates)
        .where(
          and(
            inArray(schema.retakeGates.assignmentId, classAssignments),
            inArray(schema.retakeGates.studentId, classStudents)
          )
        ),
      db
        .select({
          assignmentId: schema.attemptUnlocks.assignmentId,
          studentId: schema.attemptUnlocks.studentId,
          attemptNumber: schema.attemptUnlocks.attemptNumber,
          grantedAt: schema.attemptUnlocks.grantedAt,
        })
        .from(schema.attemptUnlocks)
        .where(
          and(
            inArray(schema.attemptUnlocks.assignmentId, classAssignments),
            inArray(schema.attemptUnlocks.studentId, classStudents)
          )
        ),
      // The targets on the class's counting scores (codes for "Retake needed (LT3, LT4)").
      db
        .select({
          id: schema.learningTargets.id,
          code: schema.learningTargets.code,
          title: schema.learningTargets.title,
          sortOrder: schema.learningTargets.sortOrder,
        })
        .from(schema.learningTargets)
        .where(
          sql`${schema.learningTargets.id} in (select jsonb_object_keys(f.per_target)::uuid from ${schema.assignmentFinalScores} f join ${schema.assignments} a on a.id = f.assignment_id where a.class_id = ${classId})`
        ),
      // Finished activities waiting for this teacher's check-off, with the targets they serve.
      db
        .select({
          studentId: schema.activityCompletions.studentId,
          activityId: schema.activityCompletions.activityId,
          learningTargetId: schema.activityTargets.learningTargetId,
        })
        .from(schema.activityCompletions)
        .innerJoin(
          schema.relearningActivities,
          eq(schema.activityCompletions.activityId, schema.relearningActivities.id)
        )
        .innerJoin(
          schema.activityTargets,
          eq(schema.activityTargets.activityId, schema.relearningActivities.id)
        )
        .where(
          and(
            inArray(schema.activityCompletions.studentId, classStudents),
            eq(schema.relearningActivities.requiresTeacherVerification, true),
            eq(schema.activityCompletions.teacherVerified, false),
            sql`${schema.relearningActivities.ownerId} = (select c.owner_id from ${schema.classes} c where c.id = ${classId})`
          )
        ),
    ]);
  const cls = classRows[0];
  if (!cls) return null;

  const attemptsBy = groupBy(attempts, (a) => pairKey(a.assignmentId, a.studentId));
  const finalBy = new Map(finals.map((f) => [pairKey(f.assignmentId, f.studentId), f]));
  const gatesBy = groupBy(gates, (g) => pairKey(g.assignmentId, g.studentId));
  const unlocksBy = groupBy(unlocks, (u) => pairKey(u.assignmentId, u.studentId));
  const pendingBy = groupBy(pending, (p) => p.studentId);
  const codeBy = new Map(targets.map((t) => [t.id, t.code]));

  // Wave 2: the latest finished attempt of each pair, where corrections can be owed (not practice,
  // not a CVTC course), with what corrections scope reads: served items, stored scores, per-target
  // percents, and the corrections themselves.
  const asgBy = new Map(assignments.map((a) => [a.id, a]));
  const latestIds: string[] = [];
  for (const list of attemptsBy.values()) {
    const a = asgBy.get(list[0].assignmentId);
    if (!a || a.type === "practice" || a.cvtcRules) continue;
    const latest = list.filter((x) => x.status !== "in_progress").at(-1);
    if (latest) latestIds.push(latest.id);
  }
  const details = latestIds.length
    ? await db
        .select({
          id: schema.attempts.id,
          questionSet: schema.attempts.questionSet,
          scores:
            sql`(select coalesce(jsonb_agg(jsonb_build_object('questionId', r.question_id, 'autoScore', r.auto_score, 'manualScore', r.manual_score)), '[]'::jsonb) from ${schema.responses} r where r.attempt_id = attempts.id)`.mapWith(
              fromJson<ScoreJson[]>
            ),
          targetPercents:
            sql`(select coalesce(jsonb_object_agg(t.learning_target_id, t.percent), '{}'::jsonb) from ${schema.attemptTargetScores} t where t.attempt_id = attempts.id)`.mapWith(
              fromJson<Record<string, number>>
            ),
          corrections:
            sql`(select coalesce(jsonb_agg(jsonb_build_object('questionId', c.question_id, 'status', c.status, 'reviewerNote', c.reviewer_note)), '[]'::jsonb) from ${schema.corrections} c where c.attempt_id = attempts.id)`.mapWith(
              fromJson<CorrectionJson[]>
            ),
        })
        .from(schema.attempts)
        .where(inArray(schema.attempts.id, latestIds))
    : [];
  const detailBy = new Map(details.map((d) => [d.id, d]));
  const week = startOfWeek(now);

  const cellFor = (a: (typeof assignments)[number], studentId: string): ClassGradebookCell => {
    const key = pairKey(a.id, studentId);
    const mine = attemptsBy.get(key) ?? [];
    const used = mine.length;
    const finished = mine.filter((x) => x.status !== "in_progress");
    const open = mine.filter((x) => x.status === "in_progress").at(-1) ?? null;
    const latest = finished.at(-1) ?? null;
    const submitted = finished
      .map((x) => x.submittedAt?.getTime())
      .filter((t): t is number => t !== undefined);
    const firstSubmittedAt = submitted.length ? new Date(Math.min(...submitted)) : null;
    const lastSubmittedAt = submitted.length ? new Date(Math.max(...submitted)) : null;
    const percents = finished.map((x) => x.percent).filter((p): p is number => p !== null);
    const final = finalBy.get(key) ?? null;
    const pairGates = gatesBy.get(key) ?? [];
    const pairUnlocks = unlocksBy.get(key) ?? [];
    const unlockedThrough = Math.max(
      0,
      ...pairUnlocks.filter((u) => u.grantedAt).map((u) => u.attemptNumber)
    );
    const cvtcRules = !!a.cvtcRules;

    // Corrections on the latest finished attempt, scoped as `getCorrectionsSummary` scopes them.
    let corrections: ClassGradebookCell["corrections"] = null;
    const detail = latest ? detailBy.get(latest.id) : undefined;
    if (latest && detail) {
      const needed = questionsNeedingCorrection({
        type: a.type,
        items: correctableItems(
          detail.questionSet,
          new Map(detail.scores.map((r) => [r.questionId, r]))
        ),
        targetPercents: detail.targetPercents,
        threshold: a.retakeThreshold,
        optedInTargetIds: pairGates.filter((g) => g.optedIn).map((g) => g.learningTargetId),
        cvtcRules,
      });
      const set = summarizeSet(needed, detail.corrections);
      if (set.state !== "none")
        corrections = { ...set, attemptId: latest.id, attemptNumber: latest.number };
    }

    // A summative's retake picture, as `getRetakeStatus` builds it, from the stored gate rows only.
    let retake: ClassGradebookCell["retake"] = null;
    const perTarget: PerTargetBest = final?.perTarget ?? {};
    if (a.type === "summative" && latest && final && Object.keys(perTarget).length) {
      const list = retakeTargets({
        perTarget,
        names: targets,
        gates: pairGates,
        threshold: a.retakeThreshold,
        cvtcRules,
      });
      retake = {
        targets: list,
        plan: planRetake({
          targets: list,
          threshold: a.retakeThreshold,
          optionalRetakes: a.optionalRetakes,
          attemptsUsed: used,
          attemptsAllowed: a.attemptsAllowed,
        }),
      };
    }

    const card = deriveCardState(
      {
        type: a.type,
        opensAt: a.opensAt,
        closesAt: a.closesAt,
        attemptsAllowed: a.attemptsAllowed,
        retakeThreshold: a.retakeThreshold,
        retakesNeedUnlock: a.retakesNeedUnlock,
        correctionsCap: a.correctionsCap,
        retakeWindowDays: a.retakeWindowDays,
        cvtcRules,
        attemptsUsed: used,
        inProgress: !!open,
        unlockedThrough,
        firstPercent: finished[0]?.percent ?? null,
        firstSubmittedAt,
        bestPercent: percents.length ? Math.max(...percents) : null,
        finalPercent: final?.percent ?? null,
        corrections: corrections?.state ?? "none",
        plan: retake?.plan ?? null,
      },
      now
    );

    // The teacher's part: what the inbox counts for this pair, and who is testing now.
    const pause = open ? currentPause(open, a.closesAt, now) : null;
    const requested = pairUnlocks.some(
      (u) =>
        !u.grantedAt &&
        staleRequest({
          attemptNumber: u.attemptNumber,
          used,
          retakesNeedUnlock: a.retakesNeedUnlock,
          attemptsAllowed: a.attemptsAllowed,
        }) === null
    );
    // Approved, but something else still stops the try (checked the way `startAttempt` checks).
    let unlockedBlocker: RequestBlocker | null = null;
    const nextUnlocked =
      a.retakesNeedUnlock &&
      used > 0 &&
      !open &&
      unlockedThrough >= used + 1 &&
      (a.attemptsAllowed === null || used < a.attemptsAllowed);
    if (nextUnlocked) {
      unlockedBlocker = requestBlocker({
        assignment: { ...a, retakeWindowDays: card.capped ? a.retakeWindowDays : null },
        used,
        lastSubmittedAt,
        firstSubmittedAt,
        now,
      });
      const plan = retake?.plan;
      if (!unlockedBlocker && plan?.blocker && plan.blocker !== "no_attempts")
        unlockedBlocker = { reason: plan.blocker };
    }
    const selected = new Set(retake?.plan.selected ?? []);
    const activitiesToCheck = new Set(
      (pendingBy.get(studentId) ?? [])
        .filter((p) => selected.has(p.learningTargetId))
        .map((p) => p.activityId)
    ).size;

    const tag = cellTag({
      card,
      attemptsUsed: used,
      live: open
        ? {
            paused: !!pause,
            asked: !!pause && !!open.resumeRequestedAt,
            answered: Math.min(open.answered, open.total),
            total: open.total,
          }
        : null,
      requested,
      correctionsToCheck: mine.filter((x) => x.correctionsToCheck > 0).length,
      toGrade: finished.reduce((n, x) => n + x.pendingManual, 0),
      activitiesToCheck,
      corrections,
      retake,
      unlockedBlocker,
      opensAt: a.opensAt,
    });

    return {
      assignmentId: a.id,
      studentId,
      card: card.state,
      cycle: card.cycle,
      rule: card.rule,
      tag,
      score: final
        ? { percent: final.percent, tier: final.tier as 1 | 2 | 3 | null, basis: final.basis }
        : null,
      attemptsUsed: used,
      attempts: mine.map((x) => ({
        id: x.id,
        number: x.number,
        status: x.status,
        percent: x.percent,
        startedAt: x.startedAt,
        submittedAt: x.submittedAt,
        tabSwitches: x.tabSwitches,
        pendingManual: x.status === "in_progress" ? 0 : x.pendingManual,
        paused: x.id === open?.id && !!pause,
        scopeCodes: x.scope ? x.scope.map((id) => codeBy.get(id) ?? "?") : null,
      })),
      openAttemptId: open?.id ?? null,
      latestAttemptId: latest?.id ?? null,
      corrections,
      retake,
      retakeBy: card.retakeBy,
      tabSwitches: Math.max(0, ...mine.map((x) => x.tabSwitches)),
      movedUpThisWeek: !!final && movedUp(final, week),
    };
  };

  const rows = roster.map((student) => ({
    student,
    cells: assignments.map((a) => cellFor(a, student.id)),
  }));
  const columns: ClassGradebookColumn[] = assignments.map((a) => ({
    assignmentId: a.id,
    assessmentId: a.assessmentId,
    title: a.title,
    type: a.type,
    opensAt: a.opensAt,
    closesAt: a.closesAt,
    status: assignmentStatus(a, now),
    attemptsAllowed: a.attemptsAllowed,
    threshold: a.retakeThreshold,
    reviewMode: a.reviewMode,
    retakesNeedUnlock: a.retakesNeedUnlock,
    correctionsCap: correctionsCapOn({ ...a, cvtcRules: !!a.cvtcRules }),
    cvtcRules: !!a.cvtcRules,
    footer: columnFooter({
      type: a.type,
      enrolled: roster.length,
      finals: roster.flatMap((s) => finalBy.get(pairKey(a.id, s.id)) ?? []),
      now,
    }),
  }));
  return { class: cls, students: roster, columns, rows, generatedAt: now };
}
