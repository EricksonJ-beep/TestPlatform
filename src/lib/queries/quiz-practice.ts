/**
 * Quiz relearning reads (Jon, Oct 14 2026, docs/student-home-plan.md R3). The rule itself is pure
 * (`quizPracticeNeeds`, `src/lib/quiz-practice.ts`); these read what it needs in batches: the
 * students' finished practice with per-target scores worked out in SQL, and each target's names
 * and practice content. The student home and the class gradebook read many students or tests in
 * one query each; `getQuizPracticeData` is the one-test read for `startAttempt` and
 * `requestRetake`. Reads only. Callers pass the guards first.
 */
import { and, desc, eq, inArray, isNotNull, ne, sql, type SQLWrapper } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PracticeResult, PracticeTargetInfo, QuizPracticeData } from "@/lib/quiz-practice";

/** A json aggregate as an object, whether the driver parsed it already or handed back text. */
const fromJson = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

const lt = schema.learningTargets;

/**
 * A learning target's names and practice content, as select columns, so a read that already
 * lists targets (the class gradebook's) can carry them without another query.
 */
export const practiceTargetColumns = {
  id: lt.id,
  code: lt.code,
  title: lt.title,
  sortOrder: lt.sortOrder,
  hasSet: sql<boolean>`exists (select 1 from ${schema.practiceSetTargets} pst join ${schema.practiceSets} ps on ps.id = pst.practice_set_id where pst.learning_target_id = learning_targets.id and ps.is_published)`,
  // The questions Build my practice can deal for it: live, in a bank of its course open for practice.
  openQuestions: sql<number>`(select count(distinct q.id)::int from ${schema.questionTargets} qt join ${schema.questions} q on q.id = qt.question_id join ${schema.questionBanks} b on b.id = q.bank_id where qt.learning_target_id = learning_targets.id and not q.is_archived and b.open_practice and not b.is_archived and b.course_id = learning_targets.course_id)`,
};

/** Names and practice content for the given targets (ids, or a subquery of ids). */
export async function loadPracticeTargets(
  targetIds: string[] | SQLWrapper
): Promise<PracticeTargetInfo[]> {
  if (Array.isArray(targetIds) && targetIds.length === 0) return [];
  return db.select(practiceTargetColumns).from(lt).where(inArray(lt.id, targetIds));
}

type ByTargetJson = Record<string, { questions: number; earned: number; possible: number }>;

/**
 * Every finished practice attempt of the given students (ids, or a subquery of ids), with what
 * quiz relearning reads: per target over the served questions tagged to it, how many and the
 * points earned of the points possible on the auto-graded ones; the targets of the set it was on;
 * and a worksheet's credited targets. Grouped by student.
 */
export async function loadPracticeResults(
  studentIds: string[] | SQLWrapper
): Promise<Map<string, PracticeResult[]>> {
  const out = new Map<string, PracticeResult[]>();
  if (Array.isArray(studentIds) && studentIds.length === 0) return out;
  const pa = schema.practiceAttempts;
  // Raw names inside the subqueries: a one-table select leaves columns unqualified, and
  // practice_set_targets has a practice_set_id of its own.
  const item = sql.raw(`practice_attempts.answers -> (q->>'questionId')`);
  const rows = await db
    .select({
      studentId: pa.studentId,
      completedAt: pa.completedAt,
      practiceSetId: pa.practiceSetId,
      percent: pa.percent,
      creditedTargetIds:
        sql`practice_attempts.answers -> '_worksheet' -> 'creditedTargetIds'`.mapWith(
          fromJson<unknown>
        ),
      setTargetIds:
        sql`(select coalesce(jsonb_agg(pst.learning_target_id), '[]'::jsonb) from ${schema.practiceSetTargets} pst where pst.practice_set_id = practice_attempts.practice_set_id)`.mapWith(
          fromJson<string[]>
        ),
      byTarget:
        sql`(select coalesce(jsonb_object_agg(x.target_id, jsonb_build_object('questions', x.questions, 'earned', x.earned, 'possible', x.possible)), '{}'::jsonb) from (select q->>'learningTargetId' as target_id, count(*)::int as questions, coalesce(sum((${item}->>'pointsEarned')::float8), 0) as earned, coalesce(sum((${item}->>'pointsPossible')::float8) filter (where ${item}->>'pointsEarned' is not null), 0) as possible from jsonb_array_elements(practice_attempts.question_set) q where q->>'learningTargetId' is not null group by 1) x)`.mapWith(
          fromJson<ByTargetJson>
        ),
    })
    .from(pa)
    .where(and(inArray(pa.studentId, studentIds), isNotNull(pa.completedAt)));
  for (const r of rows) {
    const list = out.get(r.studentId) ?? out.set(r.studentId, []).get(r.studentId)!;
    list.push({
      completedAt: new Date(r.completedAt!),
      practiceSetId: r.practiceSetId,
      setTargetIds: r.setTargetIds ?? [],
      byTarget: r.byTarget ?? {},
      percent: r.percent === null ? null : Number(r.percent),
      creditedTargetIds: Array.isArray(r.creditedTargetIds)
        ? (r.creditedTargetIds as string[])
        : null,
    });
  }
  return out;
}

/**
 * One student on one quiz (for `startAttempt` and `requestRetake`): the latest finished attempt
 * with its per-target percents, those targets' practice content, and the student's practice.
 */
export async function getQuizPracticeData(
  assignmentId: string,
  studentId: string
): Promise<QuizPracticeData> {
  const [latest] = await db
    .select({ id: schema.attempts.id, submittedAt: schema.attempts.submittedAt })
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.assignmentId, assignmentId),
        eq(schema.attempts.studentId, studentId),
        ne(schema.attempts.status, "in_progress")
      )
    )
    .orderBy(desc(schema.attempts.number))
    .limit(1);
  if (!latest) return { latest: null, targets: [], practice: [] };
  const scores = await db
    .select({
      learningTargetId: schema.attemptTargetScores.learningTargetId,
      percent: schema.attemptTargetScores.percent,
    })
    .from(schema.attemptTargetScores)
    .where(eq(schema.attemptTargetScores.attemptId, latest.id));
  if (scores.length === 0)
    return {
      latest: { submittedAt: latest.submittedAt, targetPercents: {} },
      targets: [],
      practice: [],
    };
  const [targets, practice] = await Promise.all([
    loadPracticeTargets(scores.map((s) => s.learningTargetId)),
    loadPracticeResults([studentId]),
  ]);
  return {
    latest: {
      submittedAt: latest.submittedAt,
      targetPercents: Object.fromEntries(scores.map((s) => [s.learningTargetId, s.percent])),
    },
    targets,
    practice: practice.get(studentId) ?? [],
  };
}
