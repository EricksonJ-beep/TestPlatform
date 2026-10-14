/**
 * Teacher Dashboard reads. Callers must already have passed requireTeacher(); every query is
 * scoped to the given teacher's own rows.
 *
 * "Needs you" (Jon, Oct 13 2026; docs/dashboard-plan.md): everything waiting on the teacher
 * across ALL their courses, one row per thing, each naming its course · period. The rules for
 * which requests are current and what still blocks them live in `src/lib/needs-you.ts`.
 */
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { correctionsClear } from "@/lib/corrections";
import { correctionsCapOn } from "@/lib/grading";
import {
  needsYouCounts,
  requestBlocker,
  staleRequest,
  type ClassPlace,
  type NeedsYouGroup,
  type RequestBlocker,
  type StaleReason,
} from "@/lib/needs-you";
import { currentPause, type PauseReason } from "@/lib/pause";
import { practiceOwed, quizPracticeNeeds } from "@/lib/quiz-practice";
import { loadCorrectionScopes, scopeSummary } from "@/lib/queries/corrections";
import { listPendingVerifications, type PendingVerification } from "@/lib/queries/practice";
import { loadPracticeResults, loadPracticeTargets } from "@/lib/queries/quiz-practice";
import { countUnmatchedEmails } from "@/lib/queries/worksheets";
import { correctionsRule, planRetake, retakeTargets } from "@/lib/retakes";

/** The course of the class (where the row happens), as opposed to the assessment's course. */
const classCourse = alias(schema.courses, "class_course");
const placeColumns = {
  className: schema.classes.name,
  period: schema.classes.period,
  courseName: classCourse.name,
};
const toPlace = (r: { className: string; period: string | null; courseName: string | null }) =>
  ({ className: r.className, period: r.period, courseName: r.courseName }) satisfies ClassPlace;
const asDate = (v: Date | string | null | undefined) => (v ? new Date(v) : null);

// ---------------------------------------------------------------------------
// Paused tests (Finish later)
// ---------------------------------------------------------------------------

export type PausedAttempt = {
  attemptId: string;
  assignmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  title: string;
  attemptNumber: number;
  place: ClassPlace;
  pausedAt: Date;
  reason: PauseReason;
  /** When the student pressed "Ask my teacher"; null when they haven't asked. */
  askedAt: Date | null;
};

/**
 * Every paused test on the teacher's assignments (Finish later, Jon Oct 13 2026), oldest pause
 * first. Paused is worked out in code with `currentPause` (research notes A1): a stored pause, or
 * an open attempt that has gone idle or outlived its window but hasn't been touched since.
 */
export async function listPausedAttempts(
  teacherId: string,
  now = new Date()
): Promise<PausedAttempt[]> {
  const rows = await db
    .select({
      attemptId: schema.attempts.id,
      assignmentId: schema.attempts.assignmentId,
      studentId: schema.attempts.studentId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      title: schema.assessments.title,
      attemptNumber: schema.attempts.number,
      status: schema.attempts.status,
      startedAt: schema.attempts.startedAt,
      dueAt: schema.attempts.dueAt,
      pausedAt: schema.attempts.pausedAt,
      pauseReason: schema.attempts.pauseReason,
      lastActiveAt: schema.attempts.lastActiveAt,
      askedAt: schema.attempts.resumeRequestedAt,
      closesAt: schema.assignments.closesAt,
      ...placeColumns,
    })
    .from(schema.attempts)
    .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .leftJoin(classCourse, eq(schema.classes.courseId, classCourse.id))
    .innerJoin(schema.users, eq(schema.attempts.studentId, schema.users.id))
    .where(
      and(eq(schema.assignments.ownerId, teacherId), eq(schema.attempts.status, "in_progress"))
    );
  const out: PausedAttempt[] = [];
  for (const r of rows) {
    const point = currentPause(r, r.closesAt, now);
    if (!point) continue;
    out.push({
      attemptId: r.attemptId,
      assignmentId: r.assignmentId,
      studentId: r.studentId,
      firstName: r.firstName,
      lastName: r.lastName,
      title: r.title,
      attemptNumber: r.attemptNumber,
      place: toPlace(r),
      pausedAt: point.at,
      reason: point.reason,
      askedAt: r.askedAt,
    });
  }
  return out.sort((a, b) => a.pausedAt.getTime() - b.pausedAt.getTime());
}

// ---------------------------------------------------------------------------
// Retake requests
// ---------------------------------------------------------------------------

export type RetakeRequest = {
  id: string;
  assignmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  title: string;
  className: string;
  place: ClassPlace;
  attemptNumber: number;
  requestedAt: Date | null;
  /** The student's best percent so far on this assignment, when results exist. */
  bestPercent: number | null;
  /** Why the request is a leftover (Clear it); null when it is current (Approve or Decline). */
  stale: StaleReason | null;
  /** What would still stop the try from starting once approved; null when nothing would. */
  blocker: RequestBlocker | null;
};

/**
 * Pending retake requests on the teacher's assignments, oldest first (Jon, Oct 1 2026; Oct 13
 * 2026 for current vs leftover). A current request carries what would still block the start
 * after approval (wait time, retake window, closed, no retake at their score, relearning gates,
 * and on a quiz its corrections and practice: Jon, Oct 14 2026, decisions 4–5), checked the way
 * `startAttempt` checks it. Reads only: a summative's relearning gates come from the stored gate
 * rows (a pair with none reads its gates shut, as in the class gradebook), never from
 * `getRetakeStatus`, which writes missing rows; all of them in three batched reads, and a quiz's
 * corrections and practice in three more.
 */
export async function listRetakeRequests(
  teacherId: string,
  now = new Date()
): Promise<RetakeRequest[]> {
  const assessmentCourse = alias(schema.courses, "assessment_course");
  const u = schema.attemptUnlocks;
  const mine = sql`a.assignment_id = ${u.assignmentId} and a.student_id = ${u.studentId}`;
  const rows = await db
    .select({
      id: u.id,
      assignmentId: u.assignmentId,
      studentId: u.studentId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      title: schema.assessments.title,
      type: schema.assessments.type,
      attemptNumber: u.attemptNumber,
      requestedAt: u.requestedAt,
      opensAt: schema.assignments.opensAt,
      closesAt: schema.assignments.closesAt,
      attemptsAllowed: schema.assignments.attemptsAllowed,
      retakeWaitHours: schema.assignments.retakeWaitHours,
      retakesNeedUnlock: schema.assignments.retakesNeedUnlock,
      correctionsCap: schema.assignments.correctionsCap,
      retakeWindowDays: schema.assignments.retakeWindowDays,
      retakeThreshold: schema.assignments.retakeThreshold,
      optionalRetakes: schema.assignments.optionalRetakes,
      cvtcRules: assessmentCourse.cvtcRules,
      enrolled: sql<boolean>`exists (select 1 from ${schema.enrollments} e where e.class_id = ${schema.assignments.classId} and e.student_id = ${u.studentId})`,
      used: sql<number>`(select count(*)::int from ${schema.attempts} a where ${mine})`,
      bestPercent: sql<
        number | null
      >`(select max(a.percent) from ${schema.attempts} a where ${mine} and a.status <> 'in_progress')`,
      firstPercent: sql<
        number | null
      >`(select a.percent from ${schema.attempts} a where ${mine} and a.status <> 'in_progress' order by a.number asc limit 1)`,
      lastSubmittedAt: sql<
        Date | string | null
      >`(select max(a.submitted_at) from ${schema.attempts} a where ${mine} and a.status <> 'in_progress')`,
      firstSubmittedAt: sql<
        Date | string | null
      >`(select min(a.submitted_at) from ${schema.attempts} a where ${mine} and a.status <> 'in_progress')`,
      latestAttemptId: sql<
        string | null
      >`(select a.id from ${schema.attempts} a where ${mine} and a.status <> 'in_progress' order by a.number desc limit 1)`,
      latestSubmittedAt: sql<
        Date | string | null
      >`(select a.submitted_at from ${schema.attempts} a where ${mine} and a.status <> 'in_progress' order by a.number desc limit 1)`,
      ...placeColumns,
    })
    .from(u)
    .innerJoin(schema.assignments, eq(u.assignmentId, schema.assignments.id))
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .leftJoin(assessmentCourse, eq(schema.assessments.courseId, assessmentCourse.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .leftJoin(classCourse, eq(schema.classes.courseId, classCourse.id))
    .innerJoin(schema.users, eq(u.studentId, schema.users.id))
    .where(and(eq(schema.assignments.ownerId, teacherId), isNull(u.grantedAt)))
    .orderBy(asc(u.requestedAt));

  const out = rows.map((r) => {
    const stale = staleRequest({ ...r, enrolled: !!r.enrolled });
    let blocker: RequestBlocker | null = null;
    // The cap's retake window applies only where the cap does (never in a CVTC course).
    const capped = correctionsCapOn(r);
    const rule = correctionsRule({
      type: r.type,
      capped,
      cvtcRules: !!r.cvtcRules,
      firstPercent: r.firstPercent === null ? null : Number(r.firstPercent),
      threshold: r.retakeThreshold,
    });
    if (!stale) {
      // At or above the line under the cap, corrections are the way up and `startAttempt`
      // refuses any retake (decision 2), so an approval would unlock nothing. That outlasts a
      // wait, a window or a closed test, so it is named ahead of them.
      blocker =
        rule === "to_full"
          ? { reason: "no_retake" }
          : requestBlocker({
              assignment: { ...r, retakeWindowDays: capped ? r.retakeWindowDays : null },
              used: r.used,
              lastSubmittedAt: asDate(r.lastSubmittedAt),
              firstSubmittedAt: asDate(r.firstSubmittedAt),
              now,
            });
    }
    return { r, stale, blocker, rule };
  });

  // A current quiz request with nothing else in the way: its corrections, then its practice
  // (Jon, Oct 14 2026: owed with "Retakes need my OK" on too), read in three batched reads.
  const quizzes = out.filter(
    (x) => !x.stale && !x.blocker && x.r.type === "formative" && x.r.latestAttemptId
  );
  if (quizzes.length) {
    const latestIds = quizzes.map((x) => x.r.latestAttemptId!);
    const ats = schema.attemptTargetScores;
    const [scopes, practice, targets] = await Promise.all([
      loadCorrectionScopes(latestIds),
      loadPracticeResults([...new Set(quizzes.map((x) => x.r.studentId))]),
      loadPracticeTargets(
        db.select({ id: ats.learningTargetId }).from(ats).where(inArray(ats.attemptId, latestIds))
      ),
    ]);
    for (const x of quizzes) {
      const scope = scopes.get(x.r.latestAttemptId!);
      if (!scope) continue;
      const set = scopeSummary(scope, {
        type: x.r.type,
        threshold: x.r.retakeThreshold,
        optedInTargetIds: [],
        cvtcRules: !!x.r.cvtcRules,
      });
      if (x.rule === "gate" && !correctionsClear(set)) {
        x.blocker = { reason: "corrections" };
        continue;
      }
      const owed = practiceOwed(
        quizPracticeNeeds({
          type: x.r.type,
          rule: x.rule,
          threshold: x.r.retakeThreshold,
          data: {
            latest: {
              submittedAt: asDate(x.r.latestSubmittedAt),
              targetPercents: scope.targetPercents,
            },
            targets,
            practice: practice.get(x.r.studentId) ?? [],
          },
        })
      );
      if (owed.length) x.blocker = { reason: "practice", codes: owed.map((t) => t.code) };
    }
  }

  // A current summative request with nothing else in the way: its relearning gates, read as stored.
  const summatives = out.filter((x) => !x.stale && !x.blocker && x.r.type === "summative");
  if (summatives.length) {
    const key = (assignmentId: string, studentId: string) => `${assignmentId}:${studentId}`;
    const pairsOf = (cols: { assignmentId: AnyPgColumn; studentId: AnyPgColumn }) =>
      or(
        ...summatives.map((x) =>
          and(eq(cols.assignmentId, x.r.assignmentId), eq(cols.studentId, x.r.studentId))
        )
      );
    const [finals, gates] = await Promise.all([
      db
        .select({
          assignmentId: schema.assignmentFinalScores.assignmentId,
          studentId: schema.assignmentFinalScores.studentId,
          perTarget: schema.assignmentFinalScores.perTarget,
        })
        .from(schema.assignmentFinalScores)
        .where(pairsOf(schema.assignmentFinalScores)),
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
        .where(pairsOf(schema.retakeGates)),
    ]);
    const targetIds = [...new Set(finals.flatMap((f) => Object.keys(f.perTarget)))];
    const names = targetIds.length
      ? await db
          .select({
            id: schema.learningTargets.id,
            code: schema.learningTargets.code,
            title: schema.learningTargets.title,
            sortOrder: schema.learningTargets.sortOrder,
          })
          .from(schema.learningTargets)
          .where(inArray(schema.learningTargets.id, targetIds))
      : [];
    const finalBy = new Map(finals.map((f) => [key(f.assignmentId, f.studentId), f]));
    for (const x of summatives) {
      const k = key(x.r.assignmentId, x.r.studentId);
      const final = finalBy.get(k);
      if (!final || Object.keys(final.perTarget).length === 0) continue;
      const targets = retakeTargets({
        perTarget: final.perTarget,
        names,
        gates: gates.filter((g) => key(g.assignmentId, g.studentId) === k),
        threshold: x.r.retakeThreshold,
        cvtcRules: !!x.r.cvtcRules,
      });
      const plan = planRetake({
        targets,
        threshold: x.r.retakeThreshold,
        optionalRetakes: x.r.optionalRetakes,
        attemptsUsed: x.r.used,
        attemptsAllowed: x.r.attemptsAllowed,
      });
      if (!plan.canStart && plan.blocker)
        x.blocker = {
          reason: plan.blocker === "no_attempts" ? "no_attempts_left" : plan.blocker,
        };
    }
  }

  return out.map(({ r, stale, blocker }) => ({
    id: r.id,
    assignmentId: r.assignmentId,
    studentId: r.studentId,
    firstName: r.firstName,
    lastName: r.lastName,
    title: r.title,
    className: r.className,
    place: toPlace(r),
    attemptNumber: r.attemptNumber,
    requestedAt: r.requestedAt,
    bestPercent: r.bestPercent === null ? null : Number(r.bestPercent),
    stale,
    blocker,
  }));
}

// ---------------------------------------------------------------------------
// Corrections and grading
// ---------------------------------------------------------------------------

export type CorrectionSetRow = {
  attemptId: string;
  assignmentId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  title: string;
  attemptNumber: number;
  place: ClassPlace;
  /** Corrections in the submitted set. */
  answers: number;
  /** Of those, how many the explanation check flagged. */
  flagged: number;
  submittedAt: Date | null;
};

/** Correction sets waiting for the teacher's approval, one per attempt, oldest first. */
export async function listCorrectionSets(teacherId: string): Promise<CorrectionSetRow[]> {
  const submittedAt = sql<Date | string | null>`min(${schema.corrections.submittedAt})`;
  const rows = await db
    .select({
      attemptId: schema.corrections.attemptId,
      assignmentId: schema.assignments.id,
      studentId: schema.attempts.studentId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      title: schema.assessments.title,
      attemptNumber: schema.attempts.number,
      answers: sql<number>`count(*)::int`,
      flagged: sql<number>`(count(*) filter (where ${schema.corrections.aiFlag}))::int`,
      submittedAt,
      ...placeColumns,
    })
    .from(schema.corrections)
    .innerJoin(schema.attempts, eq(schema.corrections.attemptId, schema.attempts.id))
    .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .leftJoin(classCourse, eq(schema.classes.courseId, classCourse.id))
    .innerJoin(schema.users, eq(schema.attempts.studentId, schema.users.id))
    .where(
      and(eq(schema.assignments.ownerId, teacherId), eq(schema.corrections.status, "submitted"))
    )
    .groupBy(
      schema.corrections.attemptId,
      schema.assignments.id,
      schema.attempts.studentId,
      schema.attempts.number,
      schema.users.firstName,
      schema.users.lastName,
      schema.assessments.title,
      schema.classes.name,
      schema.classes.period,
      classCourse.name
    )
    .orderBy(submittedAt);
  return rows.map((r) => ({
    attemptId: r.attemptId,
    assignmentId: r.assignmentId,
    studentId: r.studentId,
    firstName: r.firstName,
    lastName: r.lastName,
    title: r.title,
    attemptNumber: r.attemptNumber,
    place: toPlace(r),
    answers: r.answers,
    flagged: r.flagged,
    submittedAt: asDate(r.submittedAt),
  }));
}

export type GradingRow = {
  assignmentId: string;
  title: string;
  place: ClassPlace;
  /** Written answers still waiting for a score. */
  answers: number;
  students: number;
  oldestAt: Date | null;
};

/**
 * Tests with answers waiting for the teacher's score, one row per assignment, oldest first.
 * Same rule as the grading queue (`listGradingQueue`): finished attempts, no auto and no manual
 * score yet.
 */
export async function listAnswersToGrade(teacherId: string): Promise<GradingRow[]> {
  const oldestAt = sql<Date | string | null>`min(${schema.attempts.submittedAt})`;
  const rows = await db
    .select({
      assignmentId: schema.assignments.id,
      title: schema.assessments.title,
      answers: sql<number>`count(*)::int`,
      students: sql<number>`count(distinct ${schema.attempts.studentId})::int`,
      oldestAt,
      ...placeColumns,
    })
    .from(schema.responses)
    .innerJoin(schema.attempts, eq(schema.responses.attemptId, schema.attempts.id))
    .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .leftJoin(classCourse, eq(schema.classes.courseId, classCourse.id))
    .where(
      and(
        eq(schema.assignments.ownerId, teacherId),
        ne(schema.attempts.status, "in_progress"),
        isNull(schema.responses.autoScore),
        isNull(schema.responses.manualScore)
      )
    )
    .groupBy(
      schema.assignments.id,
      schema.assessments.title,
      schema.classes.name,
      schema.classes.period,
      classCourse.name
    )
    .orderBy(oldestAt);
  return rows.map((r) => ({
    assignmentId: r.assignmentId,
    title: r.title,
    place: toPlace(r),
    answers: r.answers,
    students: r.students,
    oldestAt: asDate(r.oldestAt),
  }));
}

// ---------------------------------------------------------------------------
// The inbox
// ---------------------------------------------------------------------------

export type NeedsYou = {
  /** Paused tests whose student pressed "Ask my teacher" (only these count; Jon, Oct 13 2026). */
  asked: PausedAttempt[];
  /** Current requests and leftovers to clear. */
  requests: RetakeRequest[];
  corrections: CorrectionSetRow[];
  grading: GradingRow[];
  activities: PendingVerification[];
  /** Worksheet emails on the teacher's worksheets not yet matched to a student. */
  worksheetEmails: number;
};

/** Everything waiting on the teacher, across all their courses (Jon, Oct 13 2026). */
export async function getNeedsYou(teacherId: string, now = new Date()): Promise<NeedsYou> {
  const [paused, requests, corrections, grading, activities, worksheetEmails] = await Promise.all([
    listPausedAttempts(teacherId, now),
    listRetakeRequests(teacherId, now),
    listCorrectionSets(teacherId),
    listAnswersToGrade(teacherId),
    listPendingVerifications(teacherId),
    countUnmatchedEmails(teacherId),
  ]);
  const asked = paused
    .filter((p) => p.askedAt)
    .sort((a, b) => a.askedAt!.getTime() - b.askedAt!.getTime());
  return { asked, requests, corrections, grading, activities, worksheetEmails };
}

export type DashboardCounts = Record<NeedsYouGroup, number> & {
  /** "N things need you": the rows in the inbox. */
  total: number;
  /** Current retake requests only (the ones to approve or decline; leftovers are in `requests`). */
  retakeRequests: number;
  /** Correction sets waiting for approval. */
  correctionsAwaiting: number;
};

/** The Dashboard's counts, straight from the inbox so the number always equals its rows. */
export async function getDashboardCounts(teacherId: string): Promise<DashboardCounts> {
  const inbox = await getNeedsYou(teacherId);
  return {
    ...needsYouCounts(inbox),
    retakeRequests: inbox.requests.filter((r) => !r.stale).length,
    correctionsAwaiting: inbox.corrections.length,
  };
}
