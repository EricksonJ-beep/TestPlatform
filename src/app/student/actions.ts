"use server";

import { and, asc, eq, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/activity-log";
import { canStartAttempt, startReasonText } from "@/lib/assignments";
import { createAttempt, finalizeAttempt } from "@/lib/attempts";
import { AWAITING_GRADE_TEXT } from "@/lib/card-state";
import {
  pauseAttempt,
  resumeAttempt,
  resumeCodeValid,
  settleAttempt,
  touchAttempt,
} from "@/lib/attempt-pause";
import { correctionsClear } from "@/lib/corrections";
import { setOptIn } from "@/lib/gates";
import { correctionsCapOn } from "@/lib/grading";
import { practiceOwed, practiceOwedText, quizPracticeNeeds } from "@/lib/quiz-practice";
import { getCorrectionsSummary, latestFinishedAttemptId } from "@/lib/queries/corrections";
import { getQuizPracticeData } from "@/lib/queries/quiz-practice";
import { openUntilFor } from "@/lib/queries/reopen";
import { effectiveClose } from "@/lib/reopen";
import { getRetakeStatus } from "@/lib/queries/retakes";
import { BLOCKER_TEXT, correctionsRule, TO_FULL_TEXT } from "@/lib/retakes";
import {
  ActionError,
  type AttemptAccess,
  assertOwnStudentRow,
  requireAssignmentAccess,
  requireAttemptAccess,
  withAuthz,
} from "@/lib/authz";

/** Saves are accepted this long after the deadline to absorb clock skew and a slow last request. */
const GRACE_MS = 5_000;

const answerSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("choice"), optionId: z.string().uuid().nullable() }),
    z.object({ kind: z.literal("multi"), optionIds: z.array(z.string().uuid()).max(30) }),
    z.object({ kind: z.literal("text"), text: z.string().max(20_000) }),
    z.object({
      kind: z.literal("match"),
      pairs: z.record(z.string().uuid(), z.string().max(1_000)),
    }),
    z.object({ kind: z.literal("order"), optionIds: z.array(z.string().uuid()).max(30) }),
  ])
  .nullable();

function revalidate(assignmentId: string) {
  revalidatePath("/student");
  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath(`/app/results/${assignmentId}`);
  revalidatePath("/app/assign");
}

/**
 * What must be done before a student's next attempt, or before they may ask for it, beyond the
 * window, the wait and the teacher's unlock; the same rules the student card reads, so the card
 * and the server agree. Rules: no retake where corrections are the way to 100% (`to_full`, Jon
 * Oct 13 2026, decision 2); the last attempt's corrections clear (approved, or nothing to correct),
 * with or without "Retakes need my OK" (Jon, Oct 14 2026, decision 4); on a quiz, every missed
 * learning target practised to 80% (decision 5, `quizPracticeNeeds`). Throws what the student sees.
 */
async function assertRetakePrerequisites(
  assignmentId: string,
  studentId: string,
  assignment: {
    type: "practice" | "formative" | "summative";
    correctionsCap: boolean;
    cvtcRules: boolean | null;
    retakeThreshold: number;
  }
): Promise<void> {
  // The cap never applies in a CVTC course (Jon, Oct 13 2026).
  const capped = correctionsCapOn(assignment);
  const [first] = await db
    .select({ percent: schema.attempts.percent })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, studentId),
        ne(schema.attempts.status, "in_progress")
      )
    )
    .orderBy(asc(schema.attempts.number))
    .limit(1);
  const rule = correctionsRule({
    type: assignment.type,
    capped,
    cvtcRules: !!assignment.cvtcRules,
    firstPercent: first?.percent ?? null,
    threshold: assignment.retakeThreshold,
  });
  const lastAttemptId =
    rule === "gate" || rule === "to_full"
      ? await latestFinishedAttemptId(assignmentId, studentId)
      : null;
  const corrections = lastAttemptId ? await getCorrectionsSummary(lastAttemptId) : null;
  // Capped formative at or above the threshold: corrections → 100% is the way up, never a retake.
  if (rule === "to_full")
    throw new ActionError(
      corrections?.state === "approved" ? TO_FULL_TEXT.done : TO_FULL_TEXT.pending,
      403
    );
  // Rule (PLAN.md §4): no retake until corrections on the last attempt are done (and approved, in
  // that mode). Only CVTC rules (Oct 13 2026) take corrections off the gate.
  if (corrections && !correctionsClear(corrections)) {
    throw new ActionError(
      corrections.state === "submitted"
        ? "Your corrections are waiting for your teacher's approval."
        : `Finish your corrections on attempt ${corrections.attemptNumber} first.`,
      403
    );
  }
  // Quiz relearning (Jon, Oct 14 2026): practice every missed target first, CVTC courses too.
  if (assignment.type === "formative") {
    const owed = practiceOwed(
      quizPracticeNeeds({
        type: assignment.type,
        rule,
        threshold: assignment.retakeThreshold,
        data: await getQuizPracticeData(assignmentId, studentId),
      })
    );
    if (owed.length) throw new ActionError(practiceOwedText(owed), 403);
  }
}

/**
 * Start (or resume) an attempt. Rules: enrolled student only; inside the student's
 * window (the close, or a reopen the teacher approved after it: Oct 14 2026, R5);
 * access code if set; attempts remaining; nothing waiting for a grade; then what
 * `assertRetakePrerequisites` checks (corrections, quiz practice), and a summative's
 * relearning gates: the same rules the student card follows. An in-progress attempt
 * is resumed; one that ran past its deadline is submitted first.
 */
export const startAttempt = withAuthz(async (assignmentId: string, accessCode: string | null) => {
  const access = await requireAssignmentAccess(assignmentId);
  if (access.as !== "student") throw new ActionError("Students only.", 403);
  const now = new Date();

  const open = await db.query.attempts.findFirst({
    columns: { id: true, dueAt: true },
    where: and(
      eq(schema.attempts.assignmentId, assignmentId),
      eq(schema.attempts.studentId, access.userId),
      eq(schema.attempts.status, "in_progress")
    ),
  });
  if (open) {
    // Finish later (Oct 13 2026): an idle or window-closed attempt pauses rather than ending;
    // a paused one opens on its paused screen, where the resume code reopens it.
    if (await settleAttempt(open.id, now)) return { attemptId: open.id, resumed: true };
    if (open.dueAt && open.dueAt.getTime() + GRACE_MS < now.getTime()) {
      await finalizeAttempt(open.id, open.dueAt);
    } else {
      return { attemptId: open.id, resumed: true };
    }
  }

  const [assignment] = await db
    .select({
      opensAt: schema.assignments.opensAt,
      closesAt: schema.assignments.closesAt,
      accessCode: schema.assignments.accessCode,
      attemptsAllowed: schema.assignments.attemptsAllowed,
      retakeWaitHours: schema.assignments.retakeWaitHours,
      retakesNeedUnlock: schema.assignments.retakesNeedUnlock,
      correctionsCap: schema.assignments.correctionsCap,
      retakeWindowDays: schema.assignments.retakeWindowDays,
      retakeThreshold: schema.assignments.retakeThreshold,
      type: schema.assessments.type,
      cvtcRules: schema.courses.cvtcRules,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .leftJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  if (!assignment) throw new ActionError("Not found.", 404);
  // The cap, and its retake window, never apply in a CVTC course (Jon, Oct 13 2026).
  const capped = correctionsCapOn(assignment);
  const [unlock] = await db
    .select({ through: sql<number>`coalesce(max(${schema.attemptUnlocks.attemptNumber}), 0)::int` })
    .from(schema.attemptUnlocks)
    .where(
      and(
        eq(schema.attemptUnlocks.assignmentId, assignmentId),
        eq(schema.attemptUnlocks.studentId, access.userId),
        isNotNull(schema.attemptUnlocks.grantedAt)
      )
    );
  const [last] = await db
    .select({
      submittedAt: sql<Date | null>`max(${schema.attempts.submittedAt})`,
      firstSubmittedAt: sql<Date | null>`min(${schema.attempts.submittedAt})`,
    })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, access.userId),
        sql`${schema.attempts.status} <> 'in_progress'`
      )
    );
  const lastSubmittedAt = last?.submittedAt ? new Date(last.submittedAt) : null;
  const firstSubmittedAt = last?.firstSubmittedAt ? new Date(last.firstSubmittedAt) : null;
  const used = await db.$count(
    schema.attempts,
    and(
      eq(schema.attempts.assignmentId, assignmentId),
      eq(schema.attempts.studentId, access.userId)
    )
  );
  const check = canStartAttempt({
    assignment: {
      ...assignment,
      // The retake window is a corrections-cap rule, so formatives only (Jon, Oct 8 2026).
      retakeWindowDays: capped ? assignment.retakeWindowDays : null,
    },
    attemptsUsed: used,
    lastSubmittedAt,
    firstSubmittedAt,
    unlockedThrough: unlock?.through ?? 0,
    // A retake the teacher approved after the close (Jon, Oct 14 2026, R5).
    openUntil: used > 0 ? await openUntilFor(assignmentId, access.userId, used + 1) : null,
    accessCode,
    now,
  });
  if (!check.ok) {
    throw new ActionError(
      startReasonText(check),
      check.reason === "code_required" || check.reason === "code_wrong" ? 400 : 403,
      {
        accessCode:
          check.reason === "code_required" || check.reason === "code_wrong"
            ? [startReasonText(check)]
            : [],
      }
    );
  }
  // Jon, Oct 14 2026: nothing starts while written answers wait for the teacher's grade; the
  // card says "Waiting for your grade" (`deriveCardState`), and this is the same rule.
  if (
    used > 0 &&
    (await db.$count(
      schema.attempts,
      and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, access.userId),
        eq(schema.attempts.status, "submitted")
      )
    )) > 0
  )
    throw new ActionError(AWAITING_GRADE_TEXT, 403);
  // Corrections, a quiz's practice (Jon, Oct 13–14 2026), worked out exactly as the card does.
  if (used > 0) await assertRetakePrerequisites(assignmentId, access.userId, assignment);
  // Rule (PLAN.md §2, §4): a summative retake covers only the required and opted-in targets, and only once every gate is open.
  let scope: string[] | null = null;
  if (used > 0) {
    const retake = await getRetakeStatus(assignmentId, access.userId);
    if (retake) {
      if (!retake.plan.canStart) throw new ActionError(BLOCKER_TEXT[retake.plan.blocker!], 403);
      scope = retake.plan.selected;
    }
  }
  let created;
  try {
    created = await createAttempt({ assignmentId, studentId: access.userId, scope, now });
  } catch (err) {
    if (err instanceof Error && err.message === "empty")
      throw new ActionError("This test has no questions yet. Tell your teacher.", 409);
    throw err;
  }
  await logActivity({
    userId: access.userId,
    kind: "attempt_started",
    assignmentId,
    detail: { attemptNumber: created.number },
  });
  revalidate(assignmentId);
  return { attemptId: created.attemptId, resumed: false };
});

/**
 * Ask the teacher for the next attempt (Jon, Oct 1 2026). Rules: the assignment has
 * "Retakes need my OK" on, or it has closed for this student, with the setting or
 * without (Jon, Oct 14 2026, decision 1: "Students ask, I approve"; R4); a finished
 * attempt exists and none is open or waiting for a grade; attempts remain; a retake
 * is on offer (not practice, not a quiz already at 100%); corrections are clear and a quiz's missed targets practised (decisions 4–5:
 * "To-do, then ask"), and a summative's relearning gates open, as `startAttempt`
 * checks them. The cap's retake window doesn't stop a closed test's request: the
 * teacher decides (decision 2). The row is a request until the teacher grants it.
 * Idempotent: asking again changes nothing (and logs nothing). On a closed test an
 * unlock that can no longer open it (given before the close, or a reopen that has
 * ended) becomes a fresh request, so it reaches the teacher's Needs you; a reopen
 * approved while the student was asking is kept.
 */
export const requestRetake = withAuthz(async (assignmentId: string) => {
  const access = await requireAssignmentAccess(assignmentId);
  if (access.as !== "student") throw new ActionError("Students only.", 403);
  const now = new Date();
  const [assignment] = await db
    .select({
      attemptsAllowed: schema.assignments.attemptsAllowed,
      retakesNeedUnlock: schema.assignments.retakesNeedUnlock,
      closesAt: schema.assignments.closesAt,
      correctionsCap: schema.assignments.correctionsCap,
      retakeThreshold: schema.assignments.retakeThreshold,
      type: schema.assessments.type,
      cvtcRules: schema.courses.cvtcRules,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .leftJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  if (!assignment) throw new ActionError("Not found.", 404);
  const [counts] = await db
    .select({
      used: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${schema.attempts.status} = 'in_progress')::int`,
      ungraded: sql<number>`count(*) filter (where ${schema.attempts.status} = 'submitted')::int`,
      best: sql<
        number | null
      >`max(${schema.attempts.percent}) filter (where ${schema.attempts.status} <> 'in_progress')`,
    })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, access.userId)
      )
    );
  const used = counts?.used ?? 0;
  const next = used + 1;
  // The student's own close (R5): the assignment's, or a reopen already approved for this try.
  const close = effectiveClose(
    assignment.closesAt,
    used > 0 ? await openUntilFor(assignmentId, access.userId, next) : null
  );
  const closed = !!close && close <= now;
  if (!closed && !assignment.retakesNeedUnlock)
    throw new ActionError("This assignment doesn't need a request.", 409);
  if (used === 0) throw new ActionError("Take the quiz once first.", 409);
  if ((counts?.open ?? 0) > 0) throw new ActionError("Finish the attempt you're on first.", 409);
  if ((counts?.ungraded ?? 0) > 0) throw new ActionError(AWAITING_GRADE_TEXT, 409);
  if (assignment.attemptsAllowed !== null && next > assignment.attemptsAllowed)
    throw new ActionError("You've used every attempt.", 409);
  // Only a retake the card offers (`cycleState`): none on practice, none on a quiz already at
  // 100%. A summative's plan is checked below.
  if (assignment.type === "practice")
    throw new ActionError("Practice has no retakes. You can practice again any time.", 409);
  if (assignment.type === "formative" && Number(counts?.best ?? 0) >= 100)
    throw new ActionError("You already have 100% on this quiz. There's nothing to retake.", 409);
  // To-do, then ask (Jon, Oct 14 2026): the same prerequisites the start checks.
  await assertRetakePrerequisites(assignmentId, access.userId, assignment);
  if (assignment.type === "summative") {
    const retake = await getRetakeStatus(assignmentId, access.userId);
    if (retake && !retake.plan.canStart)
      throw new ActionError(BLOCKER_TEXT[retake.plan.blocker!], 403);
  }
  const u = schema.attemptUnlocks;
  const insert = db
    .insert(u)
    .values({ assignmentId, studentId: access.userId, attemptNumber: next, requestedAt: now });
  const written = await (
    closed
      ? insert.onConflictDoUpdate({
          target: [u.assignmentId, u.studentId, u.attemptNumber],
          set: { requestedAt: now, grantedAt: null, grantedBy: null, openUntil: null },
          // Only a grant that can't open it (from before the close, or a reopen that ended): a
          // reopen the teacher approved since the read above stands.
          setWhere: and(isNotNull(u.grantedAt), or(isNull(u.openUntil), lte(u.openUntil, now))),
        })
      : insert.onConflictDoNothing()
  ).returning({ id: u.id });
  if (written.length)
    await logActivity({
      userId: access.userId,
      kind: "retake_requested",
      assignmentId,
      detail: { attemptNumber: next },
    });
  revalidate(assignmentId);
  revalidatePath("/app");
  return { attemptNumber: next };
});

/** Opt in to (or out of) retaking a target that is already proficient (PLAN.md §4). */
export const setRetakeOptIn = withAuthz(
  async (assignmentId: string, learningTargetId: string, optedIn: boolean) => {
    const access = await requireAssignmentAccess(assignmentId);
    if (access.as !== "student") throw new ActionError("Students only.", 403);
    const status = await getRetakeStatus(assignmentId, access.userId);
    if (!status) throw new ActionError("There's no retake to choose on this assignment.", 409);
    if (!status.optionalRetakes)
      throw new ActionError("Optional retakes are turned off for this test.", 403);
    const target = status.targets.find((t) => t.id === learningTargetId);
    if (!target) throw new ActionError("That target isn't on this test.", 400);
    if (target.required) throw new ActionError("That target is already required.", 409);
    const open = await db.query.attempts.findFirst({
      columns: { id: true },
      where: and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, access.userId),
        eq(schema.attempts.status, "in_progress")
      ),
    });
    if (open) throw new ActionError("Finish the attempt you're on first.", 409);
    await setOptIn(assignmentId, access.userId, learningTargetId, !!optedIn);
    revalidate(assignmentId);
    return { optedIn: !!optedIn };
  }
);

// Rule: only the attempt's own student may write to it, only while in progress and not paused, only before the deadline (+ grace).
async function writableAttempt(access: AttemptAccess) {
  const attemptId = access.attempt.id;
  assertOwnStudentRow(access, access.attempt);
  const now = new Date();
  const paused = await settleAttempt(attemptId, now);
  const attempt = await db.query.attempts.findFirst({
    columns: {
      id: true,
      status: true,
      dueAt: true,
      questionSet: true,
      assignmentId: true,
      lockedQuestionIds: true,
    },
    where: eq(schema.attempts.id, attemptId),
  });
  if (!attempt) throw new ActionError("Not found.", 404);
  if (attempt.status !== "in_progress")
    throw new ActionError("This attempt is already submitted.", 409);
  if (paused) throw new ActionError(PAUSED, 423);
  if (attempt.dueAt && attempt.dueAt.getTime() + GRACE_MS < now.getTime())
    throw new ActionError("Time is up.", 409);
  await touchAttempt(attemptId, now);
  return { access, attempt };
}

const PAUSED = "This test is paused. Your teacher's resume code opens it again.";

/** Autosave one answer. The answer is stored as given; nothing is graded until submit. */
export const saveAnswer = withAuthz(
  async (attemptId: string, questionId: string, rawAnswer: unknown) => {
    const { attempt } = await writableAttempt(await requireAttemptAccess(attemptId));
    if (!attempt.questionSet.some((q) => q.questionId === questionId))
      throw new ActionError("That question isn't on this attempt.", 400);
    if ((attempt.lockedQuestionIds ?? []).includes(questionId))
      throw new ActionError("That answer was locked when the test paused.", 409);
    const parsed = answerSchema.safeParse(rawAnswer);
    if (!parsed.success) throw new ActionError("Couldn't read that answer.", 400);
    const answeredAt = new Date();
    await db
      .insert(schema.responses)
      .values({ attemptId, questionId, answer: parsed.data, answeredAt })
      .onConflictDoUpdate({
        target: [schema.responses.attemptId, schema.responses.questionId],
        set: { answer: parsed.data, answeredAt },
      });
    return { savedAt: answeredAt.toISOString() };
  }
);

export const setFlag = withAuthz(
  async (attemptId: string, questionId: string, flagged: boolean) => {
    const { attempt } = await writableAttempt(await requireAttemptAccess(attemptId));
    if (!attempt.questionSet.some((q) => q.questionId === questionId))
      throw new ActionError("That question isn't on this attempt.", 400);
    await db
      .insert(schema.responses)
      .values({ attemptId, questionId, answer: null, flagged: !!flagged })
      .onConflictDoUpdate({
        target: [schema.responses.attemptId, schema.responses.questionId],
        set: { flagged: !!flagged },
      });
    return { flagged: !!flagged };
  }
);

/** The security footer's count: leaving the tab is recorded for the teacher (PLAN.md §5, §6). */
export const recordTabSwitch = withAuthz(async (attemptId: string) => {
  const access = await requireAttemptAccess(attemptId);
  assertOwnStudentRow(access, access.attempt);
  const [row] = await db
    .update(schema.attempts)
    .set({ tabSwitches: sql`${schema.attempts.tabSwitches} + 1` })
    .where(and(eq(schema.attempts.id, attemptId), eq(schema.attempts.status, "in_progress")))
    .returning({ tabSwitches: schema.attempts.tabSwitches });
  return { tabSwitches: row?.tabSwitches ?? 0 };
});

/**
 * Submit: grades with the pure library and writes every score server-side.
 * Accepted after the deadline too (that's the autosubmit), but never twice.
 */
export const submitAttempt = withAuthz(async (attemptId: string, auto = false) => {
  const access = await requireAttemptAccess(attemptId);
  assertOwnStudentRow(access, access.attempt);
  // The countdown's autosubmit at a window's close pauses instead (Finish later, Oct 13 2026);
  // a student who presses Submit themselves still submits.
  if (auto && (await settleAttempt(attemptId))) throw new ActionError(PAUSED, 423);
  const attempt = await db.query.attempts.findFirst({
    columns: { status: true, dueAt: true, assignmentId: true, number: true, pausedAt: true },
    where: eq(schema.attempts.id, attemptId),
  });
  if (!attempt) throw new ActionError("Not found.", 404);
  if (attempt.status !== "in_progress") throw new ActionError("Already submitted.", 409);
  if (attempt.pausedAt) throw new ActionError(PAUSED, 423);
  const now = new Date();
  const submittedAt = attempt.dueAt && attempt.dueAt < now ? attempt.dueAt : now;
  const score = await finalizeAttempt(attemptId, submittedAt);
  await logActivity({
    userId: access.userId,
    kind: "attempt_submitted",
    assignmentId: attempt.assignmentId,
    detail: {
      attemptNumber: attempt.number,
      percent: score.pendingManual > 0 ? null : score.percent,
    },
  });
  const asg = await db.query.assignments.findFirst({
    columns: { resultsReleased: true },
    where: eq(schema.assignments.id, attempt.assignmentId),
  });
  revalidate(attempt.assignmentId);
  return {
    assignmentId: attempt.assignmentId,
    percent: asg?.resultsReleased ? score.percent : null,
    totalEarned: asg?.resultsReleased ? score.totalEarned : null,
    totalPossible: score.totalPossible,
    pendingManual: score.pendingManual,
  };
});

/**
 * Finish later (Jon, Oct 13 2026): the student pauses their own test. Answers
 * so far are saved and locked, the clock stops, and the questions stay hidden
 * until the teacher's resume code (or the teacher's OK) opens it again.
 */
export const finishLater = withAuthz(async (attemptId: string) => {
  const { attempt } = await writableAttempt(await requireAttemptAccess(attemptId));
  await pauseAttempt(attemptId, new Date(), "student");
  revalidate(attempt.assignmentId);
  return { assignmentId: attempt.assignmentId };
});

/** The test page's "still working" signal (sent only after real activity); pauses an idle test. */
export const attemptHeartbeat = withAuthz(async (attemptId: string) => {
  const access = await requireAttemptAccess(attemptId);
  assertOwnStudentRow(access, access.attempt);
  const now = new Date();
  if (await settleAttempt(attemptId, now)) return { paused: true };
  await db
    .update(schema.attempts)
    .set({ lastActiveAt: now })
    .where(and(eq(schema.attempts.id, attemptId), eq(schema.attempts.status, "in_progress")));
  return { paused: false };
});

/** Reopen a paused test with the teacher's resume code (good for one class period). */
export const resumeWithCode = withAuthz(async (attemptId: string, code: string) => {
  const access = await requireAttemptAccess(attemptId);
  assertOwnStudentRow(access, access.attempt);
  const asg = await db.query.assignments.findFirst({
    columns: { ownerId: true },
    where: eq(schema.assignments.id, access.attempt.assignmentId),
  });
  if (!asg) throw new ActionError("Not found.", 404);
  if (!(await resumeCodeValid(asg.ownerId, String(code ?? ""))))
    throw new ActionError("That code isn't right, or it has run out. Ask your teacher.", 400, {
      code: ["That code isn't right, or it has run out. Ask your teacher."],
    });
  if (!(await resumeAttempt(attemptId, "code")))
    throw new ActionError("This test isn't paused.", 409);
  revalidate(access.attempt.assignmentId);
  return { attemptId };
});

/**
 * Ask the teacher to let you finish (they see it in "Needs you" and on the Results page). The
 * first ask of a pause is logged (`resume_requested`, Oct 13 2026); asking again only moves the
 * time.
 */
export const askToFinish = withAuthz(async (attemptId: string) => {
  const access = await requireAttemptAccess(attemptId);
  assertOwnStudentRow(access, access.attempt);
  const before = await db.query.attempts.findFirst({
    columns: { resumeRequestedAt: true, number: true },
    where: eq(schema.attempts.id, attemptId),
  });
  const asked = await db
    .update(schema.attempts)
    .set({ resumeRequestedAt: new Date() })
    .where(
      and(
        eq(schema.attempts.id, attemptId),
        eq(schema.attempts.status, "in_progress"),
        isNotNull(schema.attempts.pausedAt)
      )
    )
    .returning({ id: schema.attempts.id });
  if (asked.length && before && !before.resumeRequestedAt)
    await logActivity({
      userId: access.userId,
      kind: "resume_requested",
      assignmentId: access.attempt.assignmentId,
      detail: { attemptNumber: before.number },
    });
  revalidate(access.attempt.assignmentId);
  return { asked: true };
});
