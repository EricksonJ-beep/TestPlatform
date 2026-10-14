/**
 * The class gradebook read (Jon, Oct 13 2026: "a complete gradebook view for the class so I can
 * see who needs to take what without having to go into each assessment"; docs/dashboard-plan.md
 * build step 3). Every enrolled student × every assignment of the class (a class is one term's
 * section, so that is this term's tests), each cell carrying the student's own card state
 * (`deriveCardState`, the rule the student home uses, so a cell and the card always agree) and
 * the teacher's status tag on top (`cellTag`).
 *
 * Batched: eleven queries in two waves whatever the class size. Nothing is written: stored gate
 * rows are read as they are (`getRetakeStatus` can write them during a read, so it is never called
 * here), and paused tests are worked out in code (`currentPause`). Quiz relearning (Jon, Oct 14
 * 2026, R3) reads every class student's finished practice in one query and the targets' practice
 * content with their names. Each student's own to-do for the class (`buildStudentToDo`, the
 * student home's builder) is made from the same rows. Callers pass requireOwner({ type: "class" })
 * first.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import type { FinalBasis, PerTargetBest } from "@/db/schema";
import { assignmentStatus, nextAttemptAt, type AssignmentStatus } from "@/lib/assignments";
import { deriveCardState, type StudentCardState } from "@/lib/card-state";
import { cellTag, columnFooter, type CellTag, type ColumnFooter } from "@/lib/class-gradebook";
import { correctionsClear, type SetSummary } from "@/lib/corrections";
import { correctionsCapOn } from "@/lib/grading";
import { requestBlocker, staleRequest, type RequestBlocker } from "@/lib/needs-you";
import { currentPause, outOfTime } from "@/lib/pause";
import { practiceOwed, type QuizPracticeTarget } from "@/lib/quiz-practice";
import { effectiveClose, endOfNextSchoolDay } from "@/lib/reopen";
import { loadCorrectionScopes, scopeSummary } from "@/lib/queries/corrections";
import { loadPracticeResults, practiceTargetColumns } from "@/lib/queries/quiz-practice";
import {
  planRetake,
  retakeTargets,
  type CorrectionsRule,
  type CycleState,
  type RetakePlan,
  type RetakeTarget,
} from "@/lib/retakes";
import { buildStudentToDo, type StudentToDo, type ToDoAssignment } from "@/lib/student-home";
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
  /** An open attempt whose time limit ran out before it paused (`outOfTime`): nobody is in it. */
  outOfTime: boolean;
  /** An open attempt's deadline (time limit or the window's close); null with neither, or paused. */
  dueAt: Date | null;
  /** When the student pressed "Ask my teacher to let me finish". */
  askedAt: Date | null;
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
  /** Quiz relearning (R3): the missed targets that need practice before a retake, as the card has them. */
  quizPractice: QuizPracticeTarget[];
  /**
   * "Retakes need my OK", or a closed test the student asked to retake or was reopened on (Jon,
   * Oct 14 2026, R4), or the same past the cap's retake window on an open test (Oct 14 2026): the
   * student's next try and where it stands (locked, asked for, or unlocked
   * by the teacher), for the cell panel's Approve / Decline, Unlock try N, Take back. Null when
   * neither applies, before attempt 1, while an attempt is open, or with no try left; also when
   * `rule` is "to_full" (no retake at their score) and nothing was asked for or unlocked.
   */
  unlock: UnlockState | null;
  /** The test closed and the teacher reopened it for this student until then (R4–R5). */
  reopenedUntil: Date | null;
  /**
   * Past the cap's retake window on an open test, the teacher approved the retake: it may start
   * until then (Jon, Oct 14 2026: "Let them ask while it's still open too").
   */
  retakeOpenUntil: Date | null;
  /** Under the cap: the last moment a retake may start. */
  retakeBy: Date | null;
  /** `retakeBy` has passed on an open test: the student asks for the retake (Oct 14 2026). */
  retakeWindowClosed: boolean;
  /** Most tab switches on any attempt. */
  tabSwitches: number;
  /** Summatives: the last tier change, since Monday, was up. */
  movedUpThisWeek: boolean;
};

export type UnlockState = {
  attemptNumber: number;
  state: "locked" | "requested" | "unlocked";
  /** The student's request for that try, if they made one. */
  requestedAt: Date | null;
  /**
   * The test has closed, or the cap's retake window has passed while it is open: Approve (or
   * Unlock) opens the retake for the student until then (R4; Oct 14 2026).
   */
  reopensUntil: Date | null;
  /** That end comes from the cap's window having passed on an open test (not a close). */
  windowEnded: boolean;
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
    /**
     * The to-do the student's own home shows for this class's tests (Jon, Oct 14 2026: the
     * student panel lists the same to-do the student sees), from the same builder.
     */
    studentToDo: StudentToDo;
  }[];
  generatedAt: Date;
};

const pairKey = (assignmentId: string, studentId: string) => `${assignmentId}:${studentId}`;
/** A json aggregate as an object, whether the driver parsed it already or handed back text. */
const fromJson = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

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
  const [
    classRows,
    roster,
    assignments,
    attempts,
    finals,
    gates,
    unlocks,
    targets,
    pending,
    practice,
  ] = await Promise.all([
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
        timeLimitMinutes: schema.assignments.timeLimitMinutes,
        accessCode: schema.assignments.accessCode,
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
        // Quiz relearning (R3) reads the latest finished attempt's per-target percents.
        targetPercents:
          sql`(select coalesce(jsonb_object_agg(t.learning_target_id, t.percent), '{}'::jsonb) from ${schema.attemptTargetScores} t where t.attempt_id = attempts.id)`.mapWith(
            fromJson<Record<string, number>>
          ),
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
        requestedAt: schema.attemptUnlocks.requestedAt,
        grantedAt: schema.attemptUnlocks.grantedAt,
        openUntil: schema.attemptUnlocks.openUntil,
      })
      .from(schema.attemptUnlocks)
      .where(
        and(
          inArray(schema.attemptUnlocks.assignmentId, classAssignments),
          inArray(schema.attemptUnlocks.studentId, classStudents)
        )
      ),
    // The targets on the class's counting scores and attempts (codes for "Retake needed (LT3,
    // LT4)"), with the practice content quiz relearning reads (R3).
    db
      .select(practiceTargetColumns)
      .from(schema.learningTargets)
      .where(
        sql`${schema.learningTargets.id} in (select jsonb_object_keys(f.per_target)::uuid from ${schema.assignmentFinalScores} f join ${schema.assignments} a on a.id = f.assignment_id where a.class_id = ${classId}) or ${schema.learningTargets.id} in (select t.learning_target_id from ${schema.attemptTargetScores} t join ${schema.attempts} x on x.id = t.attempt_id join ${schema.assignments} a on a.id = x.assignment_id where a.class_id = ${classId})`
      ),
    // Finished activities waiting for this teacher's check-off, with the targets they serve (and,
    // for the student's to-do, their titles).
    db
      .select({
        studentId: schema.activityCompletions.studentId,
        activityId: schema.activityCompletions.activityId,
        learningTargetId: schema.activityTargets.learningTargetId,
        title: schema.relearningActivities.title,
        sortOrder: schema.relearningActivities.sortOrder,
        courseId: schema.relearningActivities.courseId,
        isPublished: schema.relearningActivities.isPublished,
      })
      .from(schema.activityCompletions)
      .innerJoin(
        schema.relearningActivities,
        eq(schema.activityCompletions.activityId, schema.relearningActivities.id)
      )
      .leftJoin(
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
    // Every class student's finished practice, per target (quiz relearning, R3).
    loadPracticeResults(classStudents),
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
  // not a CVTC course, not a perfect score), with what corrections scope reads
  // (`loadCorrectionScopes`, one query).
  const asgBy = new Map(assignments.map((a) => [a.id, a]));
  const latestIds: string[] = [];
  for (const list of attemptsBy.values()) {
    const a = asgBy.get(list[0].assignmentId);
    if (!a || a.type === "practice" || a.cvtcRules) continue;
    const latest = list.filter((x) => x.status !== "in_progress").at(-1);
    if (latest && !(latest.percent !== null && latest.percent >= 100)) latestIds.push(latest.id);
  }
  const detailBy = await loadCorrectionScopes(latestIds);
  const week = startOfWeek(now);

  const cellFor = (
    a: (typeof assignments)[number],
    studentId: string
  ): { cell: ClassGradebookCell; todo: ToDoAssignment } => {
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
    // A closed test reopened for this student (Jon, Oct 14 2026, R5): the approved unlock for the
    // attempt in play (the open one, or the next), as `openUntilInPlay` reads it for the student.
    const openUntil =
      pairUnlocks.find((u) => u.grantedAt && u.attemptNumber === finished.length + 1)?.openUntil ??
      null;
    const closedTest = !!a.closesAt && a.closesAt.getTime() <= now.getTime();
    const cvtcRules = !!a.cvtcRules;

    // Corrections on the latest finished attempt, scoped as `getCorrectionsSummary` scopes them.
    let corrections: ClassGradebookCell["corrections"] = null;
    const detail = latest ? detailBy.get(latest.id) : undefined;
    if (latest && detail) {
      const set = scopeSummary(detail, {
        type: a.type,
        threshold: a.retakeThreshold,
        optedInTargetIds: pairGates.filter((g) => g.optedIn).map((g) => g.learningTargetId),
        cvtcRules,
      });
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
        awaitingGrade: finished.some((x) => x.status === "submitted"),
        unlockedThrough,
        requestedNext: pairUnlocks.some((u) => !u.grantedAt && u.attemptNumber === used + 1),
        openUntil,
        firstPercent: finished[0]?.percent ?? null,
        firstSubmittedAt,
        bestPercent: percents.length ? Math.max(...percents) : null,
        finalPercent: final?.percent ?? null,
        corrections: corrections?.state ?? "none",
        plan: retake?.plan ?? null,
        quizPractice: used
          ? {
              latest: latest
                ? { submittedAt: latest.submittedAt, targetPercents: latest.targetPercents ?? {} }
                : null,
              targets,
              practice: practice.get(studentId) ?? [],
            }
          : null,
      },
      now
    );

    // The teacher's part: what the inbox counts for this pair, and who is testing now (by the
    // student's own close: a reopened retake pauses when its reopen ends).
    const studentClose = effectiveClose(a.closesAt, openUntil);
    const pause = open ? currentPause(open, studentClose, now) : null;
    const timeUp = !!open && outOfTime(open, studentClose, now);
    const requested = pairUnlocks.some(
      (u) =>
        !u.grantedAt &&
        staleRequest({
          attemptNumber: u.attemptNumber,
          used,
          retakesNeedUnlock: a.retakesNeedUnlock,
          closed: closedTest,
          // Past the cap's window on an open test, as the card has it (a request has no approval).
          windowPassed: card.windowClosed,
          attemptsAllowed: a.attemptsAllowed,
          // The roster is the class's enrollments, so every student here is in the class.
          enrolled: true,
        }) === null
    );
    // At or above the line under the cap, corrections are the way up and `startAttempt` refuses
    // any retake (decision 2), whatever the teacher unlocks: the inbox's "No retake at their score".
    const noRetake = card.rule === "to_full";
    // Approved, but something else still stops the try (checked the way `startAttempt` checks).
    let unlockedBlocker: RequestBlocker | null = null;
    const nextUnlocked =
      (a.retakesNeedUnlock || !!card.reopenedUntil || !!card.retakeOpenUntil) &&
      used > 0 &&
      !open &&
      unlockedThrough >= used + 1 &&
      (a.attemptsAllowed === null || used < a.attemptsAllowed);
    if (nextUnlocked && noRetake) unlockedBlocker = { reason: "no_retake" };
    else if (nextUnlocked) {
      unlockedBlocker = requestBlocker({
        assignment: { ...a, retakeWindowDays: card.capped ? a.retakeWindowDays : null },
        used,
        lastSubmittedAt,
        firstSubmittedAt,
        reopenUntil: openUntil,
        now,
      });
      const plan = retake?.plan;
      if (!unlockedBlocker && plan?.blocker && plan.blocker !== "no_attempts")
        unlockedBlocker = { reason: plan.blocker };
      // Corrections and a quiz's practice come first, with or without the OK (Oct 14 2026).
      const owed = practiceOwed(card.quizPractice);
      if (!unlockedBlocker && card.rule === "gate" && corrections && !correctionsClear(corrections))
        unlockedBlocker = { reason: "corrections" };
      else if (!unlockedBlocker && owed.length)
        unlockedBlocker = { reason: "practice", codes: owed.map((t) => t.code) };
    }
    // The next try under "Retakes need my OK", as the results table offers it (Oct 1 2026), and
    // on a closed test the student's request or reopen, with the setting or without (Oct 14 2026,
    // R4), and the same past the cap's retake window on an open test (Oct 14 2026: "Let them ask
    // while it's still open too"). With no retake at their score there is nothing to unlock early;
    // a request or an unlock already there stays, so the teacher can still answer it or take it
    // back.
    const next = used + 1;
    const windowEnded = !closedTest && card.windowClosed;
    const nextRow = pairUnlocks.find((u) => u.attemptNumber === next) ?? null;
    const unlockState: UnlockState["state"] =
      unlockedThrough >= next ? "unlocked" : requested ? "requested" : "locked";
    const unlock: UnlockState | null =
      (a.retakesNeedUnlock ||
        (closedTest && (requested || !!card.reopenedUntil)) ||
        (windowEnded && requested) ||
        !!card.retakeOpenUntil) &&
      used > 0 &&
      !open &&
      (a.attemptsAllowed === null || next <= a.attemptsAllowed) &&
      !(noRetake && unlockState === "locked")
        ? {
            attemptNumber: next,
            state: unlockState,
            requestedAt: nextRow?.requestedAt ?? null,
            reopensUntil:
              (closedTest || windowEnded) && unlockState !== "unlocked"
                ? endOfNextSchoolDay(now)
                : null,
            windowEnded: windowEnded && unlockState !== "unlocked",
          }
        : null;
    const selected = new Set(retake?.plan.selected ?? []);
    const activitiesToCheck = new Set(
      (pendingBy.get(studentId) ?? [])
        .filter((p) => p.learningTargetId !== null && selected.has(p.learningTargetId))
        .map((p) => p.activityId)
    ).size;

    const tag = cellTag({
      card,
      attemptsUsed: used,
      live: open
        ? {
            paused: !!pause,
            asked: !!pause && !!open.resumeRequestedAt,
            outOfTime: timeUp,
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

    // The same assignment as the student's home reads it for their to-do (`listStudentAssignments`).
    const waitUntil = nextAttemptAt(a.retakeWaitHours, lastSubmittedAt);
    const todo: ToDoAssignment = {
      id: a.id,
      title: a.title,
      type: a.type,
      className: cls.name,
      closesAt: a.closesAt,
      status: card.status,
      state: card.state,
      cycle: card.cycle,
      attemptsAllowed: a.attemptsAllowed,
      attemptsUsed: used,
      timeLimitMinutes: a.timeLimitMinutes,
      needsCode: !!a.accessCode,
      // The wait means nothing while the test is closed to the student (ask to retake).
      nextAttemptAt: waitUntil && waitUntil > now && card.status === "open" ? waitUntil : null,
      retakesNeedUnlock: a.retakesNeedUnlock,
      retakeRequested: card.retakeRequested,
      reopenedUntil: card.reopenedUntil,
      retakeOpenUntil: card.retakeOpenUntil,
      askCounts: card.askCounts,
      correctionsCap: card.capped,
      retakeThreshold: a.retakeThreshold,
      correctionsRule: card.rule,
      retakeBy: card.retakeBy,
      retakeWindowClosed: card.windowClosed,
      firstPercent: finished[0]?.percent ?? null,
      paused: !!pause,
      progress: open ? { answered: Math.min(open.answered, open.total), total: open.total } : null,
      corrections,
      retake,
      quizPractice: card.quizPractice,
    };

    const cell: ClassGradebookCell = {
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
        outOfTime: x.id === open?.id && timeUp,
        dueAt: x.status === "in_progress" ? x.dueAt : null,
        askedAt: x.status === "in_progress" ? x.resumeRequestedAt : null,
        scopeCodes: x.scope ? x.scope.map((id) => codeBy.get(id) ?? "?") : null,
      })),
      openAttemptId: open?.id ?? null,
      latestAttemptId: latest?.id ?? null,
      corrections,
      retake,
      quizPractice: card.quizPractice,
      unlock,
      reopenedUntil: card.reopenedUntil,
      retakeOpenUntil: card.retakeOpenUntil,
      retakeBy: card.retakeBy,
      retakeWindowClosed: card.windowClosed,
      tabSwitches: Math.max(0, ...mine.map((x) => x.tabSwitches)),
      movedUpThisWeek: !!final && movedUp(final, week),
    };
    return { cell, todo };
  };

  // Activities the student finished that wait for the teacher's check-off, on the class's course,
  // as the student's "Waiting on your teacher" lists them (the student's order: sort order, title).
  const waitingActivities = (studentId: string) => [
    ...new Map(
      (pendingBy.get(studentId) ?? [])
        .filter((p) => p.isPublished && !!cls.courseId && p.courseId === cls.courseId)
        .sort((x, y) => x.sortOrder - y.sortOrder || x.title.localeCompare(y.title))
        .map((p) => [
          p.activityId,
          {
            id: p.activityId,
            title: p.title,
            state: "awaiting_teacher" as const,
            courseName: cls.courseName,
          },
        ])
    ).values(),
  ];
  const rows = roster.map((student) => {
    const made = assignments.map((a) => cellFor(a, student.id));
    return {
      student,
      cells: made.map((m) => m.cell),
      // One builder (Jon, Oct 14 2026): the student panel lists what the student's home lists.
      studentToDo: buildStudentToDo({
        assignments: made.map((m) => m.todo),
        activities: waitingActivities(student.id),
      }),
    };
  });
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
