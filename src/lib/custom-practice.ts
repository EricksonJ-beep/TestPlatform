/**
 * Server-only "Build my practice" (Jon, Oct 13 2026): a student picks a course
 * unit and one, several, or all of its learning targets and gets a fresh hand
 * of questions every time, without the teacher assigning anything. Questions
 * come only from the course's banks the teacher opened for practice
 * (`question_banks.open_practice`), so test and retake banks never leak. The
 * attempt is an ordinary practice attempt with no set: `course_id` and
 * `target_ids` record what was asked for, so "Practice again" can deal anew.
 */
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PoolQuestion } from "@/lib/assessments/serve";
import { clampPracticeSize, dealCustomPractice } from "@/lib/custom-practice-rules";
import { serveQuestions } from "@/lib/practice";

export type CustomPracticeTarget = { id: string; code: string; title: string; available: number };
export type CustomPracticeUnit = {
  id: string | null;
  name: string;
  targets: CustomPracticeTarget[];
};
export type CustomPracticeCourse = { id: string; name: string; units: CustomPracticeUnit[] };

/** Live questions in a course's open-for-practice banks, keyed by the targets they're tagged to. */
async function openQuestionsByTarget(
  courseId: string,
  targetIds?: string[]
): Promise<Map<string, PoolQuestion[]>> {
  const rows = await db
    .select({
      questionId: schema.questions.id,
      points: schema.questions.points,
      stimulusId: schema.questions.stimulusId,
      targetId: schema.questionTargets.learningTargetId,
    })
    .from(schema.questions)
    .innerJoin(
      schema.questionBanks,
      and(
        eq(schema.questions.bankId, schema.questionBanks.id),
        eq(schema.questionBanks.courseId, courseId),
        eq(schema.questionBanks.openPractice, true),
        eq(schema.questionBanks.isArchived, false)
      )
    )
    .innerJoin(schema.questionTargets, eq(schema.questionTargets.questionId, schema.questions.id))
    .innerJoin(
      schema.learningTargets,
      and(
        eq(schema.learningTargets.id, schema.questionTargets.learningTargetId),
        eq(schema.learningTargets.courseId, courseId)
      )
    )
    .where(
      and(
        eq(schema.questions.isArchived, false),
        targetIds ? inArray(schema.questionTargets.learningTargetId, targetIds) : undefined
      )
    );
  const all = new Map<string, string[]>();
  for (const r of rows)
    (all.get(r.questionId) ?? all.set(r.questionId, []).get(r.questionId)!).push(r.targetId);
  const out = new Map<string, PoolQuestion[]>();
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${r.targetId}:${r.questionId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const q = {
      questionId: r.questionId,
      points: r.points,
      stimulusId: r.stimulusId,
      targetIds: all.get(r.questionId)!,
    };
    (out.get(r.targetId) ?? out.set(r.targetId, []).get(r.targetId)!).push(q);
  }
  return out;
}

/**
 * What a student can build practice from: per course, per unit (unit order),
 * each target that has at least one open question, with how many it has.
 * Courses and units with nothing to practice are left out.
 */
export async function listCustomPracticeOptions(
  courseIds: string[]
): Promise<CustomPracticeCourse[]> {
  if (courseIds.length === 0) return [];
  const courses = await db
    .select({ id: schema.courses.id, name: schema.courses.name })
    .from(schema.courses)
    .where(inArray(schema.courses.id, courseIds))
    .orderBy(asc(schema.courses.name));
  const out: CustomPracticeCourse[] = [];
  for (const c of courses) {
    const byTarget = await openQuestionsByTarget(c.id);
    if (byTarget.size === 0) continue;
    const targets = await db
      .select({
        id: schema.learningTargets.id,
        code: schema.learningTargets.code,
        title: schema.learningTargets.title,
        sortOrder: schema.learningTargets.sortOrder,
        unitId: schema.learningTargets.unitId,
        unitName: schema.units.name,
        unitOrder: schema.units.sortOrder,
      })
      .from(schema.learningTargets)
      .leftJoin(schema.units, eq(schema.learningTargets.unitId, schema.units.id))
      .where(
        and(
          eq(schema.learningTargets.courseId, c.id),
          inArray(schema.learningTargets.id, [...byTarget.keys()])
        )
      );
    targets.sort(
      (a, b) =>
        (a.unitOrder ?? Number.MAX_SAFE_INTEGER) - (b.unitOrder ?? Number.MAX_SAFE_INTEGER) ||
        (a.unitName ?? "").localeCompare(b.unitName ?? "") ||
        a.sortOrder - b.sortOrder ||
        a.code.localeCompare(b.code, undefined, { numeric: true })
    );
    const units: CustomPracticeUnit[] = [];
    for (const t of targets) {
      const id = t.unitId ?? null;
      let u = units.find((x) => x.id === id);
      if (!u) units.push((u = { id, name: t.unitName ?? "Other targets", targets: [] }));
      u.targets.push({
        id: t.id,
        code: t.code,
        title: t.title,
        available: byTarget.get(t.id)?.length ?? 0,
      });
    }
    out.push({ id: c.id, name: c.name, units });
  }
  return out;
}

/**
 * Deal a new practice for the student on the picked targets of one course.
 * Rule: targets must belong to the course; the hand prefers questions the
 * student hasn't been dealt in their earlier built practices on this course.
 * Throws "empty" when the picked targets have no open questions.
 */
export async function startCustomPractice(
  studentId: string,
  courseId: string,
  targetIds: string[],
  count: number
): Promise<{ attemptId: string }> {
  const wanted = [...new Set(targetIds)];
  const valid = wanted.length
    ? await db
        .select({ id: schema.learningTargets.id })
        .from(schema.learningTargets)
        .where(
          and(
            eq(schema.learningTargets.courseId, courseId),
            inArray(schema.learningTargets.id, wanted)
          )
        )
    : [];
  const ids = valid.map((v) => v.id);
  if (ids.length === 0) throw new Error("empty");
  const byTarget = await openQuestionsByTarget(courseId, ids);
  if (byTarget.size === 0) throw new Error("empty");

  const prior = await db
    .select({ questionSet: schema.practiceAttempts.questionSet })
    .from(schema.practiceAttempts)
    .where(
      and(
        eq(schema.practiceAttempts.studentId, studentId),
        eq(schema.practiceAttempts.courseId, courseId),
        isNotNull(schema.practiceAttempts.targetIds)
      )
    );
  const avoid = new Set(prior.flatMap((p) => p.questionSet.map((q) => q.questionId)));
  const picked = dealCustomPractice(byTarget, clampPracticeSize(count), {
    rng: Math.random,
    avoid,
  });
  if (picked.length === 0) throw new Error("empty");
  const questionSet = await serveQuestions(picked, courseId, new Set(ids));
  const [attempt] = await db
    .insert(schema.practiceAttempts)
    .values({ studentId, courseId, targetIds: ids, questionSet, answers: {} })
    .returning({ id: schema.practiceAttempts.id });
  return { attemptId: attempt.id };
}

/** A short title for a built practice, e.g. "My practice · U2.LT1, U2.LT3" or "My practice · Unit 2". */
export async function customPracticeTitle(courseId: string, targetIds: string[]): Promise<string> {
  if (targetIds.length === 0) return "My practice";
  const rows = await db
    .select({
      code: schema.learningTargets.code,
      unitId: schema.learningTargets.unitId,
      unitName: schema.units.name,
    })
    .from(schema.learningTargets)
    .leftJoin(schema.units, eq(schema.learningTargets.unitId, schema.units.id))
    .where(
      and(
        eq(schema.learningTargets.courseId, courseId),
        inArray(schema.learningTargets.id, targetIds)
      )
    );
  const codes = rows
    .map((r) => r.code)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const unitIds = new Set(rows.map((r) => r.unitId));
  if (unitIds.size === 1 && rows[0]?.unitName && rows.length > 3)
    return `My practice · ${rows[0].unitName} · ${rows.length} targets`;
  if (codes.length > 4)
    return `My practice · ${codes.slice(0, 3).join(", ")} +${codes.length - 3} more`;
  return `My practice · ${codes.join(", ")}`;
}
