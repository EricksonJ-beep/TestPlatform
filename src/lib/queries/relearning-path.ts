/**
 * Relearning path reads (ticket R2; the rule is `src/lib/relearning-path.ts`): what the path reads
 * for many (assignment, student) pairs in a fixed number of queries (the class gradebook, Needs
 * you, the student home), and for one pair (the actions, the final score, the gates). Reads only;
 * callers pass the guards first. A pair has no path when it isn't on path rules
 * (`usesPathRules`: its course's switch, attempt 1's turn-in time, never CVTC) or attempt 1 served
 * no learning targets (an untagged quiz keeps the v2 rules). Until a course is switched on this is
 * one small query and nothing else.
 */
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { correctableItems, summarizeSet, type CorrectionsState } from "@/lib/corrections";
import { loadCorrectionScopes } from "@/lib/queries/corrections";
import {
  pathFor,
  usesPathRules,
  type PathAttempt,
  type PathState,
  type PathTargetInfo,
} from "@/lib/relearning-path";

export type PathPair = { assignmentId: string; studentId: string };

export const pathKey = (assignmentId: string, studentId: string) => `${assignmentId}:${studentId}`;

/** An assignment's settings, as far as the path and its words read them. */
export type PathAssignment = {
  id: string;
  type: "formative" | "summative";
  threshold: number;
  /** Quizzes: the path raises scores where the corrections cap is on. */
  raises: boolean;
  passMark: number;
  attemptsAllowed: number | null;
  optionalRetakes: boolean;
};

export type PathContext = {
  assignment: PathAssignment;
  state: PathState;
  /** Attempt 1's id: the attempt the path's corrections are on (decision 32). */
  firstAttemptId: string;
  firstSubmittedAt: Date;
};

/** Everything the path reads for each pair on path rules, keyed `pathKey(assignment, student)`. */
export async function loadPathStates(pairs: PathPair[]): Promise<Map<string, PathContext>> {
  const out = new Map<string, PathContext>();
  if (pairs.length === 0) return out;
  const assignmentIds = [...new Set(pairs.map((p) => p.assignmentId))];
  const assignments = await db
    .select({
      id: schema.assignments.id,
      type: schema.assessments.type,
      threshold: schema.assignments.retakeThreshold,
      correctionsCap: schema.assignments.correctionsCap,
      passMark: schema.assignments.practicePass,
      attemptsAllowed: schema.assignments.attemptsAllowed,
      optionalRetakes: schema.assignments.optionalRetakes,
      cvtcRules: schema.courses.cvtcRules,
      relearningPathFrom: schema.courses.relearningPathFrom,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
    .where(
      and(
        inArray(schema.assignments.id, assignmentIds),
        isNotNull(schema.courses.relearningPathFrom)
      )
    );
  // Only switched-on courses go further (none before launch).
  const asgBy = new Map(
    assignments.filter((a) => a.type !== "practice" && !a.cvtcRules).map((a) => [a.id, a])
  );
  const live = pairs.filter((p) => asgBy.has(p.assignmentId));
  if (live.length === 0) return out;
  const liveAssignments = [...new Set(live.map((p) => p.assignmentId))];
  const liveStudents = [...new Set(live.map((p) => p.studentId))];
  const wanted = new Set(live.map((p) => pathKey(p.assignmentId, p.studentId)));
  const mine = <T extends { assignmentId: string; studentId: string }>(rows: T[]) =>
    rows.filter((r) => wanted.has(pathKey(r.assignmentId, r.studentId)));

  const [attempts, gates, relearning, checks] = await Promise.all([
    db
      .select({
        id: schema.attempts.id,
        assignmentId: schema.attempts.assignmentId,
        studentId: schema.attempts.studentId,
        number: schema.attempts.number,
        score: schema.attempts.score,
        maxScore: schema.attempts.maxScore,
        submittedAt: schema.attempts.submittedAt,
      })
      .from(schema.attempts)
      .where(
        and(
          inArray(schema.attempts.assignmentId, liveAssignments),
          inArray(schema.attempts.studentId, liveStudents),
          ne(schema.attempts.status, "in_progress")
        )
      ),
    db
      .select({
        assignmentId: schema.retakeGates.assignmentId,
        studentId: schema.retakeGates.studentId,
        learningTargetId: schema.retakeGates.learningTargetId,
      })
      .from(schema.retakeGates)
      .where(
        and(
          inArray(schema.retakeGates.assignmentId, liveAssignments),
          inArray(schema.retakeGates.studentId, liveStudents),
          eq(schema.retakeGates.optedIn, true)
        )
      ),
    db
      .select({
        assignmentId: schema.relearningPaths.assignmentId,
        studentId: schema.relearningPaths.studentId,
        learningTargetId: schema.relearningPaths.learningTargetId,
        bundleId: schema.relearningPaths.bundleId,
        finishedAt: schema.relearningPaths.finishedAt,
        added: schema.relearningPaths.added,
      })
      .from(schema.relearningPaths)
      .where(
        and(
          inArray(schema.relearningPaths.assignmentId, liveAssignments),
          inArray(schema.relearningPaths.studentId, liveStudents)
        )
      ),
    db
      .select({
        assignmentId: schema.practiceChecks.assignmentId,
        studentId: schema.practiceChecks.studentId,
        purpose: schema.practiceChecks.purpose,
        targetIds: schema.practiceChecks.targetIds,
        relearningBundleId: schema.practiceChecks.relearningBundleId,
        unlocksAttemptNumber: schema.practiceChecks.unlocksAttemptNumber,
        passedAt: schema.practiceChecks.passedAt,
      })
      .from(schema.practiceChecks)
      .where(
        and(
          inArray(schema.practiceChecks.assignmentId, liveAssignments),
          inArray(schema.practiceChecks.studentId, liveStudents)
        )
      ),
  ]);
  const myAttempts = mine(attempts);
  if (myAttempts.length === 0) return out;

  // Attempt 1 of each pair: the lowest finished number.
  const firstBy = new Map<string, (typeof myAttempts)[number]>();
  for (const a of myAttempts) {
    const k = pathKey(a.assignmentId, a.studentId);
    const cur = firstBy.get(k);
    if (!cur || a.number < cur.number) firstBy.set(k, a);
  }
  const attemptIds = myAttempts.map((a) => a.id);
  const firstIds = [...firstBy.values()].map((a) => a.id);
  const [targetScores, scopes] = await Promise.all([
    db
      .select({
        attemptId: schema.attemptTargetScores.attemptId,
        learningTargetId: schema.attemptTargetScores.learningTargetId,
        pointsEarned: schema.attemptTargetScores.pointsEarned,
        pointsPossible: schema.attemptTargetScores.pointsPossible,
      })
      .from(schema.attemptTargetScores)
      .where(inArray(schema.attemptTargetScores.attemptId, attemptIds)),
    loadCorrectionScopes(firstIds),
  ]);
  const targetIds = [...new Set(targetScores.map((t) => t.learningTargetId))];
  const names: PathTargetInfo[] = targetIds.length
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

  const scoresBy = new Map<string, PathAttempt["perTarget"]>();
  for (const t of targetScores) {
    const m = scoresBy.get(t.attemptId) ?? {};
    m[t.learningTargetId] = { earned: t.pointsEarned, possible: t.pointsPossible };
    scoresBy.set(t.attemptId, m);
  }
  const group = <T extends { assignmentId: string; studentId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of mine(rows)) {
      const k = pathKey(r.assignmentId, r.studentId);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return m;
  };
  const attemptsBy = group(myAttempts);
  const gatesBy = group(gates);
  const relearningBy = group(relearning);
  const checksBy = group(checks);

  for (const [k, first] of firstBy) {
    const asg = asgBy.get(first.assignmentId)!;
    if (
      !first.submittedAt ||
      !usesPathRules({
        type: asg.type,
        cvtcRules: asg.cvtcRules,
        relearningPathFrom: asg.relearningPathFrom,
        firstSubmittedAt: first.submittedAt,
      })
    )
      continue;
    const firstTargets = scoresBy.get(first.id) ?? {};
    // An untagged quiz has nothing to relearn by target: the v2 rules stand.
    if (Object.keys(firstTargets).length === 0) continue;
    const scope = scopes.get(first.id);
    const corrections: Record<string, CorrectionsState> = {};
    if (scope) {
      const items = correctableItems(
        scope.items,
        new Map(scope.items.filter((r) => r.responded).map((r) => [r.questionId, r]))
      );
      for (const id of Object.keys(firstTargets)) {
        const missed = items
          .filter((i) => i.learningTargetId === id && i.earned !== null && i.earned < i.points)
          .map((i) => i.questionId);
        corrections[id] = summarizeSet(missed, scope.corrections).state;
      }
    }
    const type = asg.type as "formative" | "summative";
    const state = pathFor({
      type,
      threshold: asg.threshold,
      raises: type === "formative" && asg.correctionsCap,
      targets: names,
      attempts: (attemptsBy.get(k) ?? []).map((a) => ({
        id: a.id,
        number: a.number,
        earned: a.score ?? 0,
        possible: a.maxScore ?? 0,
        perTarget: scoresBy.get(a.id) ?? {},
      })),
      corrections,
      optedIn: (gatesBy.get(k) ?? []).map((g) => g.learningTargetId),
      relearning: (relearningBy.get(k) ?? []).map((r) => ({
        learningTargetId: r.learningTargetId,
        bundleId: r.bundleId,
        finished: r.finishedAt !== null,
        added: r.added,
      })),
      checks: (checksBy.get(k) ?? []).map((c) => ({
        purpose: c.purpose,
        targetIds: c.targetIds,
        bundleId: c.relearningBundleId,
        unlocksAttemptNumber: c.unlocksAttemptNumber,
        passed: c.passedAt !== null,
      })),
    });
    out.set(k, {
      assignment: {
        id: asg.id,
        type,
        threshold: asg.threshold,
        raises: type === "formative" && asg.correctionsCap,
        passMark: asg.passMark,
        attemptsAllowed: asg.attemptsAllowed,
        optionalRetakes: asg.optionalRetakes,
      },
      state,
      firstAttemptId: first.id,
      firstSubmittedAt: first.submittedAt,
    });
  }
  return out;
}

/** One pair's path; null when the pair isn't on path rules. */
export async function getPathState(
  assignmentId: string,
  studentId: string
): Promise<PathContext | null> {
  const map = await loadPathStates([{ assignmentId, studentId }]);
  return map.get(pathKey(assignmentId, studentId)) ?? null;
}

/**
 * Whether an assignment's course has the path switched on (a cheap check before a per-student
 * read): its `relearning_path_from` when set and not a CVTC course, else null.
 */
export async function pathSwitchOn(assignmentId: string): Promise<Date | null> {
  const [row] = await db
    .select({
      from: schema.courses.relearningPathFrom,
      cvtcRules: schema.courses.cvtcRules,
    })
    .from(schema.assignments)
    .innerJoin(schema.assessments, eq(schema.assignments.assessmentId, schema.assessments.id))
    .innerJoin(schema.courses, eq(schema.assessments.courseId, schema.courses.id))
    .where(eq(schema.assignments.id, assignmentId))
    .limit(1);
  return row && !row.cvtcRules ? row.from : null;
}
