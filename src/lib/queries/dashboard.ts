/**
 * Teacher Dashboard reads. Callers must already have passed requireTeacher(); every query is
 * scoped to the given teacher's own rows.
 *
 * "Needs you" (Jon, Oct 13 2026; docs/dashboard-plan.md): everything waiting on the teacher
 * across ALL their courses, one row per thing, each naming its course · period. The rules for
 * which requests are current and what still blocks them live in `src/lib/needs-you.ts`.
 */
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
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
import { pausePoint, type PauseReason } from "@/lib/pause";
import { listPendingVerifications, type PendingVerification } from "@/lib/queries/practice";
import { getRetakeStatus } from "@/lib/queries/retakes";
import { countUnmatchedEmails } from "@/lib/queries/worksheets";

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

const PAUSE_REASONS: PauseReason[] = ["student", "idle", "closed"];

/**
 * Every paused test on the teacher's assignments (Finish later, Jon Oct 13 2026), oldest pause
 * first. Paused is worked out in code with `pausePoint` (research notes A1): a stored pause, or an
 * open attempt that has gone idle or outlived its window but hasn't been touched since.
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
    const stored = r.pausedAt
      ? {
          at: r.pausedAt,
          reason: PAUSE_REASONS.find((x) => x === r.pauseReason) ?? ("student" as const),
        }
      : null;
    const point = stored ?? pausePoint(r, r.closesAt, now);
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
 * after approval (wait time, retake window, closed, relearning gates), checked the way
 * `startAttempt` checks it.
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
      cvtcRules: assessmentCourse.cvtcRules,
      used: sql<number>`(select count(*)::int from ${schema.attempts} a where ${mine})`,
      bestPercent: sql<
        number | null
      >`(select max(a.percent) from ${schema.attempts} a where ${mine} and a.status <> 'in_progress')`,
      lastSubmittedAt: sql<
        Date | string | null
      >`(select max(a.submitted_at) from ${schema.attempts} a where ${mine} and a.status <> 'in_progress')`,
      firstSubmittedAt: sql<
        Date | string | null
      >`(select min(a.submitted_at) from ${schema.attempts} a where ${mine} and a.status <> 'in_progress')`,
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

  const out: RetakeRequest[] = [];
  for (const r of rows) {
    const stale = staleRequest(r);
    let blocker: RequestBlocker | null = null;
    if (!stale) {
      // The cap's retake window applies only where the cap does (never in a CVTC course).
      const capped = correctionsCapOn(r);
      blocker = requestBlocker({
        assignment: { ...r, retakeWindowDays: capped ? r.retakeWindowDays : null },
        used: r.used,
        lastSubmittedAt: asDate(r.lastSubmittedAt),
        firstSubmittedAt: asDate(r.firstSubmittedAt),
        now,
      });
      if (!blocker && r.type === "summative") {
        const retake = await getRetakeStatus(r.assignmentId, r.studentId);
        if (retake && !retake.plan.canStart && retake.plan.blocker)
          blocker = {
            reason:
              retake.plan.blocker === "no_attempts" ? "no_attempts_left" : retake.plan.blocker,
          };
      }
    }
    out.push({
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
    });
  }
  return out;
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
