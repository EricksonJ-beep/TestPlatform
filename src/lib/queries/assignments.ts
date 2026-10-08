/**
 * Assignment reads for the teacher's Assign screen and the student home.
 * Callers must have passed the relevant guard first.
 */
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FinalBasis } from "@/db/schema";
import {
  assignmentStatus,
  needsUnlock,
  nextAttemptAt,
  retakeWindowEnd,
  type AssignmentStatus,
} from "@/lib/assignments";
import { getCorrectionsSummary, type CorrectionsSetSummary } from "@/lib/queries/corrections";
import { getRetakeStatus, type RetakeStatus } from "@/lib/queries/retakes";
import { cycleState, type CycleState } from "@/lib/retakes";

export type AssignmentRow = {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  assessmentType: "practice" | "formative" | "summative";
  classId: string;
  className: string;
  /** The assessment's course; the Assign and Results pages narrow by it (course focus). */
  courseId: string | null;
  opensAt: Date | null;
  closesAt: Date | null;
  accessCode: string | null;
  timeLimitMinutes: number | null;
  attemptsAllowed: number | null;
  reviewMode: "auto" | "teacher_approved";
  retakeThreshold: number;
  optionalRetakes: boolean;
  tier2Max: number;
  resultsReleased: boolean;
  retakeWaitHours: number;
  retakesNeedUnlock: boolean;
  correctionsCap: boolean;
  retakeWindowDays: number;
  createdAt: Date;
  enrolled: number;
  started: number;
  submitted: number;
  status: AssignmentStatus;
};

const baseSelect = {
  id: schema.assignments.id,
  assessmentId: schema.assignments.assessmentId,
  assessmentTitle: schema.assessments.title,
  assessmentType: schema.assessments.type,
  classId: schema.assignments.classId,
  className: schema.classes.name,
  courseId: schema.assessments.courseId,
  opensAt: schema.assignments.opensAt,
  closesAt: schema.assignments.closesAt,
  accessCode: schema.assignments.accessCode,
  timeLimitMinutes: schema.assignments.timeLimitMinutes,
  attemptsAllowed: schema.assignments.attemptsAllowed,
  reviewMode: schema.assignments.reviewMode,
  retakeThreshold: schema.assignments.retakeThreshold,
  optionalRetakes: schema.assignments.optionalRetakes,
  tier2Max: schema.assignments.tier2Max,
  resultsReleased: schema.assignments.resultsReleased,
  retakeWaitHours: schema.assignments.retakeWaitHours,
  retakesNeedUnlock: schema.assignments.retakesNeedUnlock,
  correctionsCap: schema.assignments.correctionsCap,
  retakeWindowDays: schema.assignments.retakeWindowDays,
  createdAt: schema.assignments.createdAt,
  enrolled: sql<number>`(select count(*)::int from ${schema.enrollments} e where e.class_id = ${schema.assignments.classId})`,
  started: sql<number>`(select count(distinct a.student_id)::int from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id})`,
  submitted: sql<number>`(select count(distinct a.student_id)::int from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.status <> 'in_progress')`,
};

export async function listTeacherAssignments(
  teacherId: string,
  now = new Date()
): Promise<AssignmentRow[]> {
  const rows = await db
    .select(baseSelect)
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .where(eq(schema.assignments.ownerId, teacherId))
    .orderBy(desc(schema.assignments.createdAt));
  return rows.map((r) => ({ ...r, status: assignmentStatus(r, now) }));
}

export async function getAssignmentRow(
  assignmentId: string,
  now = new Date()
): Promise<AssignmentRow | null> {
  const [r] = await db
    .select(baseSelect)
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  return r ? { ...r, status: assignmentStatus(r, now) } : null;
}

/** Published assessments the teacher owns, plus published ones shared with them at copy or above. */
export async function listAssignableAssessments(teacherId: string) {
  return db
    .select({
      id: schema.assessments.id,
      title: schema.assessments.title,
      type: schema.assessments.type,
      courseId: schema.assessments.courseId,
      courseName: schema.courses.name,
      attemptLimit: schema.assessments.attemptLimit,
      reviewMode: schema.assessments.reviewMode,
      retakeThreshold: schema.assessments.retakeThreshold,
      optionalRetakes: schema.assessments.optionalRetakes,
      showResultsImmediately: schema.assessments.showResultsImmediately,
    })
    .from(schema.assessments)
    .leftJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
    .where(
      and(
        eq(schema.assessments.isPublished, true),
        or(
          eq(schema.assessments.ownerId, teacherId),
          sql`exists (select 1 from ${schema.shares} s where s.resource_type = 'assessment' and s.resource_id = ${schema.assessments.id} and s.shared_with_user_id = ${teacherId} and s.permission in ('copy', 'co_edit'))`
        )
      )
    )
    .orderBy(asc(schema.assessments.title));
}

// ---------------------------------------------------------------------------
// Student side
// ---------------------------------------------------------------------------

export type StudentCardState = "upcoming" | "not_started" | "in_progress" | "closed" | CycleState;

export type StudentAssignment = {
  id: string;
  title: string;
  type: "practice" | "formative" | "summative";
  className: string;
  teacherLastName: string;
  opensAt: Date | null;
  closesAt: Date | null;
  timeLimitMinutes: number | null;
  attemptsAllowed: number | null;
  needsCode: boolean;
  resultsReleased: boolean;
  retakeWaitHours: number;
  /** When the wait rule lets the student start again; null when they may start now. */
  nextAttemptAt: Date | null;
  /** Every attempt after the first waits for the teacher's unlock; corrections are optional then. */
  retakesNeedUnlock: boolean;
  /** The student has asked for the next attempt and the teacher hasn't answered yet. */
  retakeRequested: boolean;
  /** Corrections cap (formatives, Jon Oct 8 2026) and the threshold it lifts to. */
  correctionsCap: boolean;
  retakeThreshold: number;
  /** Under the cap: the last moment a retake may start; null before attempt 1 or with no window. */
  retakeBy: Date | null;
  /** `retakeBy` has passed (decided server-side so the cards never read the clock while rendering). */
  retakeWindowClosed: boolean;
  /** Attempt 1's percent, which the cap reads. */
  firstPercent: number | null;
  /** The counting score as the gradebook has it, and how it came about. */
  final: { percent: number; basis: FinalBasis | null } | null;
  status: AssignmentStatus;
  attemptsUsed: number;
  inProgressAttemptId: string | null;
  /** How far the in-progress attempt is (answers saved out of questions served); null otherwise. */
  progress: { answered: number; total: number } | null;
  bestPercent: number | null;
  /** Corrections on the latest finished attempt; null when none are needed (or not applicable). */
  corrections: CorrectionsSetSummary | null;
  /** Summatives with a finished attempt: required / optional targets and their gates. */
  retake: RetakeStatus | null;
  state: StudentCardState;
};

/**
 * Rule: a student sees assignments only for classes they're enrolled in. Open ones
 * are listed with an action; scheduled ones show their open date; closed ones stay
 * visible only when the student has work in them.
 */
export async function listStudentAssignments(
  studentId: string,
  now = new Date()
): Promise<StudentAssignment[]> {
  const classIds = (
    await db
      .select({ classId: schema.enrollments.classId })
      .from(schema.enrollments)
      .where(eq(schema.enrollments.studentId, studentId))
  ).map((e) => e.classId);
  if (classIds.length === 0) return [];
  const rows = await db
    .select({
      id: schema.assignments.id,
      title: schema.assessments.title,
      type: schema.assessments.type,
      className: schema.classes.name,
      teacherLastName: schema.users.lastName,
      opensAt: schema.assignments.opensAt,
      closesAt: schema.assignments.closesAt,
      timeLimitMinutes: schema.assignments.timeLimitMinutes,
      attemptsAllowed: schema.assignments.attemptsAllowed,
      accessCode: schema.assignments.accessCode,
      resultsReleased: schema.assignments.resultsReleased,
      retakeWaitHours: schema.assignments.retakeWaitHours,
      retakesNeedUnlock: schema.assignments.retakesNeedUnlock,
      correctionsCap: schema.assignments.correctionsCap,
      retakeWindowDays: schema.assignments.retakeWindowDays,
      retakeThreshold: schema.assignments.retakeThreshold,
      firstSubmittedAt: sql<Date | null>`(select min(a.submitted_at) from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status <> 'in_progress')`,
      firstPercent: sql<
        number | null
      >`(select a.percent from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status <> 'in_progress' order by a.number asc limit 1)`,
      finalPercent: sql<
        number | null
      >`(select f.percent from ${schema.assignmentFinalScores} f where f.assignment_id = ${schema.assignments.id} and f.student_id = ${studentId})`,
      finalBasis: sql<FinalBasis | null>`(select f.basis from ${schema.assignmentFinalScores} f where f.assignment_id = ${schema.assignments.id} and f.student_id = ${studentId})`,
      lastSubmittedAt: sql<Date | null>`(select max(a.submitted_at) from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status <> 'in_progress')`,
      unlockedThrough: sql<number>`(select coalesce(max(u.attempt_number), 0)::int from ${schema.attemptUnlocks} u where u.assignment_id = ${schema.assignments.id} and u.student_id = ${studentId} and u.granted_at is not null)`,
      requestedThrough: sql<number>`(select coalesce(max(u.attempt_number), 0)::int from ${schema.attemptUnlocks} u where u.assignment_id = ${schema.assignments.id} and u.student_id = ${studentId} and u.granted_at is null)`,
      attemptsUsed: sql<number>`(select count(*)::int from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId})`,
      inProgressAttemptId: sql<
        string | null
      >`(select a.id from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status = 'in_progress' order by a.number desc limit 1)`,
      inProgressAnswered: sql<number>`(select count(*)::int from ${schema.responses} r join ${schema.attempts} a on a.id = r.attempt_id where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status = 'in_progress' and r.answer is not null)`,
      inProgressTotal: sql<number>`(select coalesce(max(jsonb_array_length(a.question_set)), 0)::int from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status = 'in_progress')`,
      latestAttemptId: sql<
        string | null
      >`(select a.id from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status <> 'in_progress' order by a.number desc limit 1)`,
      bestPercent: sql<
        number | null
      >`(select max(a.percent) from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status <> 'in_progress')`,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.classes, eq(schema.assignments.classId, schema.classes.id))
    .innerJoin(schema.users, eq(schema.assignments.ownerId, schema.users.id))
    .where(inArray(schema.assignments.classId, classIds))
    .orderBy(asc(schema.assignments.closesAt), desc(schema.assignments.createdAt));

  // Corrections state for the latest finished attempt (formative/summative only; practice never has any).
  const summaries = new Map<string, CorrectionsSetSummary>();
  const retakes = new Map<string, RetakeStatus>();
  await Promise.all(
    rows.map(async (r) => {
      if (r.type === "practice" || !r.latestAttemptId) return;
      const [s, rt] = await Promise.all([
        getCorrectionsSummary(r.latestAttemptId),
        r.type === "summative" ? getRetakeStatus(r.id, studentId) : null,
      ]);
      if (s && s.state !== "none") summaries.set(r.id, s);
      if (rt) retakes.set(r.id, rt);
    })
  );

  return rows
    .map(
      ({
        accessCode,
        lastSubmittedAt,
        latestAttemptId: _latest,
        inProgressAnswered,
        inProgressTotal,
        firstSubmittedAt,
        firstPercent: firstPercentRaw,
        finalPercent,
        finalBasis,
        retakeWindowDays,
        unlockedThrough,
        requestedThrough,
        ...r
      }): StudentAssignment => {
        const status = assignmentStatus(r, now);
        const next = nextAttemptAt(
          r.retakeWaitHours,
          lastSubmittedAt ? new Date(lastSubmittedAt) : null
        );
        const corrections = summaries.get(r.id) ?? null;
        const retake = retakes.get(r.id) ?? null;
        const bestPercent = r.bestPercent === null ? null : Number(r.bestPercent);
        // Corrections cap (Jon, Oct 8 2026): formatives only; the window counts from attempt 1.
        const capped = r.type === "formative" && r.correctionsCap;
        const firstPercent = firstPercentRaw === null ? null : Number(firstPercentRaw);
        const finalPct = finalPercent === null ? null : Number(finalPercent);
        const retakeBy = capped
          ? retakeWindowEnd(retakeWindowDays, firstSubmittedAt ? new Date(firstSubmittedAt) : null)
          : null;
        let state: StudentCardState;
        if (status === "scheduled") state = "upcoming";
        else if (status === "closed") state = "closed";
        else if (r.inProgressAttemptId) state = "in_progress";
        else if (r.attemptsUsed > 0)
          state = cycleState({
            type: r.type,
            // Rule (Jon, Oct 1 2026): with teacher unlocks on, corrections never gate the retake.
            corrections: r.retakesNeedUnlock ? "none" : (corrections?.state ?? "none"),
            attemptsUsed: r.attemptsUsed,
            attemptsAllowed: r.attemptsAllowed,
            bestPercent: capped && finalPct !== null ? finalPct : bestPercent,
            plan: retake?.plan ?? null,
            needsUnlock: r.retakesNeedUnlock && needsUnlock(r.attemptsUsed, unlockedThrough),
            correctionsCap: capped,
            firstPercent,
            threshold: r.retakeThreshold,
            windowClosed: retakeBy !== null && now >= retakeBy,
          });
        else state = "not_started";
        return {
          ...r,
          needsCode: !!accessCode,
          status,
          state,
          corrections,
          retake,
          retakeBy,
          retakeWindowClosed: retakeBy !== null && now >= retakeBy,
          firstPercent,
          final: finalPct === null ? null : { percent: finalPct, basis: finalBasis ?? null },
          progress: r.inProgressAttemptId
            ? { answered: Math.min(inProgressAnswered, inProgressTotal), total: inProgressTotal }
            : null,
          bestPercent: r.bestPercent === null ? null : Number(r.bestPercent),
          nextAttemptAt: next && next > now ? next : null,
          retakeRequested: r.retakesNeedUnlock && requestedThrough === r.attemptsUsed + 1,
        };
      }
    )
    .filter((r) => r.state !== "closed" || r.attemptsUsed > 0);
}
