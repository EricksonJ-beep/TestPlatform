/**
 * Assignment reads for the teacher's Assign screen and the student home.
 * Callers must have passed the relevant guard first.
 */
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FinalBasis } from "@/db/schema";
import { assignmentStatus, nextAttemptAt, type AssignmentStatus } from "@/lib/assignments";
import { deriveCardState, type StudentCardState } from "@/lib/card-state";
import type { PracticeResult, QuizPracticeTarget } from "@/lib/quiz-practice";
import { getCorrectionsSummary, type CorrectionsSetSummary } from "@/lib/queries/corrections";
import { loadPracticeResults, loadPracticeTargets } from "@/lib/queries/quiz-practice";
import { openUntilInPlay } from "@/lib/queries/reopen";
import { getRetakeStatus, type RetakeStatus } from "@/lib/queries/retakes";
import type { CorrectionsRule, CycleState } from "@/lib/retakes";

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
  /** The assessment's course has CVTC rules on (Jon, Oct 13 2026): no corrections cap, retakes only. */
  cvtcRules: boolean;
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
  cvtcRules: sql<boolean>`coalesce((select c.cvtc_rules from ${schema.courses} c where c.id = ${schema.assessments.courseId}), false)`,
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

export type { StudentCardState } from "@/lib/card-state";

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
  /**
   * Every attempt after the first waits for the teacher's unlock; the student asks once
   * corrections (and a quiz's practice) are done (Jon, Oct 14 2026, decision 4).
   */
  retakesNeedUnlock: boolean;
  /**
   * The student has asked for the next attempt and the teacher hasn't answered yet, on a test
   * that needs the teacher's OK or has closed (Jon, Oct 14 2026: ask to retake, R4).
   */
  retakeRequested: boolean;
  /** The test closed and the teacher reopened it for this student until then (R4–R5). */
  reopenedUntil: Date | null;
  /** "Ask to retake" is a counted to-do: the retake would be required if the test were open (R6). */
  askCounts: boolean;
  /**
   * Corrections cap (formatives, Jon Oct 8 2026) as it applies here (never in a CVTC course), and
   * the threshold it lifts to.
   */
  correctionsCap: boolean;
  retakeThreshold: number;
  /** The course has CVTC rules on (Jon, Oct 13 2026): corrections earn no credit, retakes only. */
  cvtcRules: boolean;
  /** What corrections do on this assignment; the card and `startAttempt` both follow it. */
  correctionsRule: CorrectionsRule;
  /** Under the cap: the last moment a retake may start; null before attempt 1 or with no window. */
  retakeBy: Date | null;
  /** `retakeBy` has passed (decided server-side so the cards never read the clock while rendering). */
  retakeWindowClosed: boolean;
  /** Attempt 1's percent, which the cap reads. */
  firstPercent: number | null;
  /** The counting score as the gradebook has it, and how it came about. */
  final: { percent: number; basis: FinalBasis | null } | null;
  /** The window as it stands for this student: the close, or a later approved reopen (R5). */
  status: AssignmentStatus;
  attemptsUsed: number;
  inProgressAttemptId: string | null;
  /** The in-progress attempt is paused (Finish later, Oct 13 2026), or idle long enough to be. */
  paused: boolean;
  /** How far the in-progress attempt is (answers saved out of questions served); null otherwise. */
  progress: { answered: number; total: number } | null;
  bestPercent: number | null;
  /** Corrections on the latest finished attempt; null when none are needed (or not applicable). */
  corrections: CorrectionsSetSummary | null;
  /** Summatives with a finished attempt: required / optional targets and their gates. */
  retake: RetakeStatus | null;
  /**
   * Quiz relearning (Jon, Oct 14 2026, R3): targets missed on the latest finished attempt that
   * need 80% on practice before a retake, with the quiz score, the best practice so far, and
   * whether each is done; empty where it doesn't apply (summatives, `to_full`, nothing missed).
   */
  quizPractice: QuizPracticeTarget[];
  state: StudentCardState;
  /**
   * The learning cycle after the last finished attempt, worked out on a closed test too (its
   * corrections states show on the card, R1; what comes after them is here); null before any
   * attempt and while one is open.
   */
  cycle: CycleState | null;
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
      cvtcRules: schema.courses.cvtcRules,
      firstSubmittedAt: sql<Date | null>`(select min(a.submitted_at) from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status <> 'in_progress')`,
      firstPercent: sql<
        number | null
      >`(select a.percent from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status <> 'in_progress' order by a.number asc limit 1)`,
      finalPercent: sql<
        number | null
      >`(select f.percent from ${schema.assignmentFinalScores} f where f.assignment_id = ${schema.assignments.id} and f.student_id = ${studentId})`,
      finalBasis: sql<FinalBasis | null>`(select f.basis from ${schema.assignmentFinalScores} f where f.assignment_id = ${schema.assignments.id} and f.student_id = ${studentId})`,
      lastSubmittedAt: sql<Date | null>`(select max(a.submitted_at) from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status <> 'in_progress')`,
      // Quiz relearning (R3) reads the latest finished attempt's per-target percents.
      latestSubmittedAt: sql<
        Date | string | null
      >`(select a.submitted_at from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status <> 'in_progress' order by a.number desc limit 1)`,
      latestTargetPercents:
        sql`(select coalesce(jsonb_object_agg(t.learning_target_id, t.percent), '{}'::jsonb) from ${schema.attemptTargetScores} t where t.attempt_id = (select a.id from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status <> 'in_progress' order by a.number desc limit 1))`.mapWith(
          (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v) as Record<string, number>
        ),
      unlockedThrough: sql<number>`(select coalesce(max(u.attempt_number), 0)::int from ${schema.attemptUnlocks} u where u.assignment_id = ${schema.assignments.id} and u.student_id = ${studentId} and u.granted_at is not null)`,
      // A request for the next try (attempts + 1) the teacher hasn't answered.
      requestedNext: sql<boolean>`exists (select 1 from ${schema.attemptUnlocks} u where u.assignment_id = ${schema.assignments.id} and u.student_id = ${studentId} and u.granted_at is null and u.attempt_number = (select count(*) + 1 from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId}))`,
      // A retake the teacher approved after the close (Jon, Oct 14 2026, R5).
      openUntil: openUntilInPlay(sql`${schema.assignments.id}`, sql`${studentId}`),
      attemptsUsed: sql<number>`(select count(*)::int from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId})`,
      inProgressAttemptId: sql<
        string | null
      >`(select a.id from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status = 'in_progress' order by a.number desc limit 1)`,
      awaitingGrade: sql<boolean>`exists (select 1 from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status = 'submitted')`,
      inProgressPaused: sql<boolean>`exists (select 1 from ${schema.attempts} a where a.assignment_id = ${schema.assignments.id} and a.student_id = ${studentId} and a.status = 'in_progress' and (a.paused_at is not null or a.last_active_at < now() - interval '10 minutes'))`,
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
    .leftJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
    .where(inArray(schema.assignments.classId, classIds))
    .orderBy(asc(schema.assignments.closesAt), desc(schema.assignments.createdAt));

  // Corrections state for the latest finished attempt (formative/summative only; practice never has any).
  const summaries = new Map<string, CorrectionsSetSummary>();
  const retakes = new Map<string, RetakeStatus>();
  // Quiz relearning (R3): the student's practice and the quiz targets' content, one read each.
  const quizTargetIds = [
    ...new Set(
      rows.flatMap((r) => (r.type === "formative" ? Object.keys(r.latestTargetPercents ?? {}) : []))
    ),
  ];
  const [practiceTargets, practice] = await Promise.all([
    loadPracticeTargets(quizTargetIds),
    quizTargetIds.length ? loadPracticeResults([studentId]) : new Map<string, PracticeResult[]>(),
    Promise.all(
      rows.map(async (r) => {
        if (r.type === "practice" || !r.latestAttemptId) return;
        const [s, rt] = await Promise.all([
          // CVTC rules (Jon, Oct 13 2026): nothing is ever in corrections scope there.
          r.cvtcRules ? null : getCorrectionsSummary(r.latestAttemptId),
          r.type === "summative" ? getRetakeStatus(r.id, studentId) : null,
        ]);
        if (s && s.state !== "none") summaries.set(r.id, s);
        if (rt) retakes.set(r.id, rt);
      })
    ),
  ]);

  return rows
    .map(
      ({
        accessCode,
        lastSubmittedAt,
        latestSubmittedAt,
        latestTargetPercents,
        latestAttemptId,
        inProgressAnswered,
        inProgressTotal,
        firstSubmittedAt,
        firstPercent: firstPercentRaw,
        finalPercent,
        finalBasis,
        retakeWindowDays,
        unlockedThrough,
        requestedNext,
        openUntil,
        correctionsCap,
        cvtcRules: cvtcRaw,
        ...r
      }): StudentAssignment => {
        const next = nextAttemptAt(
          r.retakeWaitHours,
          lastSubmittedAt ? new Date(lastSubmittedAt) : null
        );
        const corrections = summaries.get(r.id) ?? null;
        const retake = retakes.get(r.id) ?? null;
        const cvtcRules = !!cvtcRaw;
        const firstPercent = firstPercentRaw === null ? null : Number(firstPercentRaw);
        const finalPct = finalPercent === null ? null : Number(finalPercent);
        // Who owes what (Jon, Oct 13 2026): the same rule the teacher's class gradebook reads.
        const card = deriveCardState(
          {
            type: r.type,
            opensAt: r.opensAt,
            closesAt: r.closesAt,
            attemptsAllowed: r.attemptsAllowed,
            retakeThreshold: r.retakeThreshold,
            retakesNeedUnlock: r.retakesNeedUnlock,
            correctionsCap,
            retakeWindowDays,
            cvtcRules,
            attemptsUsed: r.attemptsUsed,
            inProgress: !!r.inProgressAttemptId,
            awaitingGrade: !!r.awaitingGrade,
            unlockedThrough,
            requestedNext: !!requestedNext,
            openUntil,
            firstPercent,
            firstSubmittedAt: firstSubmittedAt ? new Date(firstSubmittedAt) : null,
            bestPercent: r.bestPercent === null ? null : Number(r.bestPercent),
            finalPercent: finalPct,
            corrections: corrections?.state ?? "none",
            plan: retake?.plan ?? null,
            quizPractice:
              r.attemptsUsed > 0
                ? {
                    latest: latestAttemptId
                      ? {
                          submittedAt: latestSubmittedAt ? new Date(latestSubmittedAt) : null,
                          targetPercents: latestTargetPercents ?? {},
                        }
                      : null,
                    targets: practiceTargets,
                    practice: practice.get(studentId) ?? [],
                  }
                : null,
          },
          now
        );
        return {
          ...r,
          needsCode: !!accessCode,
          status: card.status,
          state: card.state,
          cycle: card.cycle,
          corrections,
          retake,
          quizPractice: card.quizPractice,
          retakeBy: card.retakeBy,
          retakeWindowClosed: card.windowClosed,
          firstPercent,
          correctionsCap: card.capped,
          cvtcRules,
          correctionsRule: card.rule,
          final: finalPct === null ? null : { percent: finalPct, basis: finalBasis ?? null },
          paused: !!r.inProgressAttemptId && !!r.inProgressPaused,
          progress: r.inProgressAttemptId
            ? { answered: Math.min(inProgressAnswered, inProgressTotal), total: inProgressTotal }
            : null,
          bestPercent: r.bestPercent === null ? null : Number(r.bestPercent),
          // The wait means nothing while the test is closed to the student (ask to retake).
          nextAttemptAt: next && next > now && card.status === "open" ? next : null,
          retakeRequested: card.retakeRequested,
          reopenedUntil: card.reopenedUntil,
          askCounts: card.askCounts,
        };
      }
    )
    .filter((r) => r.state !== "closed" || r.attemptsUsed > 0);
}
