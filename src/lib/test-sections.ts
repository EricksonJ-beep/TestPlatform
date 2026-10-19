/**
 * Unit tests are one section per learning target (PLAN.md §3.4, §10; Jon, Oct 19 2026, ticket R1
 * in docs/retake-cycle-plan.md). Per-target scores, retake gates, and the targeted retake all read
 * the *section's* target, so a test whose questions sit in one untargeted "Questions" section never
 * enters the relearning cycle.
 *
 * `planTargetSections` is the pure rule; `sectionByTarget` builds a new test's sections from its
 * questions' tags; `resectionByTarget` moves an existing single-section test into target sections
 * when nobody has started it yet.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type TargetRef = { id: string; code: string; title: string; sortOrder: number };

export type PlannedSection<T> = {
  /** Null for the "Other" section: questions with no target in the course (scored, never retaken). */
  learningTargetId: string | null;
  title: string;
  items: T[];
};

export const OTHER_SECTION_TITLE = "Other";

/**
 * Rule: one section per target the questions carry, in the course's target order (sort order,
 * then code); questions keep their given order inside a section. A question tagged to several
 * targets goes to the first of them in that order. Questions with no known target go last, in an
 * "Other" section. A section's title is "<code> · <title>".
 */
export function planTargetSections<T extends { targetIds: string[] }>(
  items: T[],
  targets: TargetRef[]
): PlannedSection<T>[] {
  const ordered = [...targets].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)
  );
  const rank = new Map(ordered.map((t, i) => [t.id, i]));
  const byTarget = new Map<string, T[]>();
  const other: T[] = [];
  for (const item of items) {
    const first = item.targetIds
      .filter((id) => rank.has(id))
      .sort((a, b) => rank.get(a)! - rank.get(b)!)[0];
    if (!first) other.push(item);
    else (byTarget.get(first) ?? byTarget.set(first, []).get(first)!).push(item);
  }
  const sections: PlannedSection<T>[] = ordered
    .filter((t) => byTarget.has(t.id))
    .map((t) => ({
      learningTargetId: t.id,
      title: `${t.code} · ${t.title}`,
      items: byTarget.get(t.id)!,
    }));
  if (other.length)
    sections.push({ learningTargetId: null, title: OTHER_SECTION_TITLE, items: other });
  return sections;
}

/** Each question's targets, and the course's targets, for planning. */
async function loadTargets(courseId: string | null, questionIds: string[]) {
  const tags = questionIds.length
    ? await db
        .select({
          questionId: schema.questionTargets.questionId,
          learningTargetId: schema.questionTargets.learningTargetId,
        })
        .from(schema.questionTargets)
        .where(inArray(schema.questionTargets.questionId, questionIds))
    : [];
  const targets: TargetRef[] = courseId
    ? await db
        .select({
          id: schema.learningTargets.id,
          code: schema.learningTargets.code,
          title: schema.learningTargets.title,
          sortOrder: schema.learningTargets.sortOrder,
        })
        .from(schema.learningTargets)
        .where(eq(schema.learningTargets.courseId, courseId))
    : [];
  const tagsBy = new Map<string, string[]>();
  for (const t of tags)
    (tagsBy.get(t.questionId) ?? tagsBy.set(t.questionId, []).get(t.questionId)!).push(
      t.learningTargetId
    );
  return { targets, tagsBy };
}

/**
 * A new test's sections from its questions, in the given order: one per target (see
 * `planTargetSections`). Returns how many questions landed in "Other".
 */
export async function sectionByTarget(
  assessmentId: string,
  courseId: string | null,
  questionIds: string[]
): Promise<{ sections: number; untargeted: number }> {
  const { targets, tagsBy } = await loadTargets(courseId, questionIds);
  const plan = planTargetSections(
    questionIds.map((questionId) => ({ questionId, targetIds: tagsBy.get(questionId) ?? [] })),
    targets
  );
  for (const [i, s] of plan.entries()) {
    const [sec] = await db
      .insert(schema.assessmentSections)
      .values({ assessmentId, title: s.title, sortOrder: i, learningTargetId: s.learningTargetId })
      .returning({ id: schema.assessmentSections.id });
    await db
      .insert(schema.assessmentQuestions)
      .values(
        s.items.map((q, j) => ({ sectionId: sec.id, questionId: q.questionId, sortOrder: j }))
      );
  }
  const other = plan.find((s) => s.learningTargetId === null);
  return { sections: plan.length, untargeted: other?.items.length ?? 0 };
}

export type ResectionOutcome =
  | { status: "resectioned"; sections: number; untargeted: number }
  | {
      status: "skipped";
      reason: "not_summative" | "already_sectioned" | "has_pool" | "has_attempts" | "no_targets";
    };

/**
 * An existing test in one untargeted section moves into target sections, keeping each question's
 * row (and its point override). Only when it is a summative, every row is a fixed question, and no
 * student has started it on any assignment: attempts store the sections they were served.
 */
export async function resectionByTarget(assessmentId: string): Promise<ResectionOutcome> {
  const assessment = await db.query.assessments.findFirst({
    columns: { type: true, courseId: true },
    where: eq(schema.assessments.id, assessmentId),
  });
  if (!assessment || assessment.type !== "summative")
    return { status: "skipped", reason: "not_summative" };
  const sections = await db
    .select()
    .from(schema.assessmentSections)
    .where(eq(schema.assessmentSections.assessmentId, assessmentId));
  if (sections.length !== 1 || sections[0].learningTargetId)
    return { status: "skipped", reason: "already_sectioned" };
  const rows = await db
    .select()
    .from(schema.assessmentQuestions)
    .where(eq(schema.assessmentQuestions.sectionId, sections[0].id))
    .orderBy(schema.assessmentQuestions.sortOrder);
  if (rows.some((r) => !r.questionId)) return { status: "skipped", reason: "has_pool" };
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.attempts)
    .innerJoin(schema.assignments, eq(schema.attempts.assignmentId, schema.assignments.id))
    .where(eq(schema.assignments.assessmentId, assessmentId));
  if (n > 0) return { status: "skipped", reason: "has_attempts" };

  const { targets, tagsBy } = await loadTargets(
    assessment.courseId,
    rows.map((r) => r.questionId!)
  );
  const plan = planTargetSections(
    rows.map((r) => ({ rowId: r.id, targetIds: tagsBy.get(r.questionId!) ?? [] })),
    targets
  );
  if (!plan.some((s) => s.learningTargetId)) return { status: "skipped", reason: "no_targets" };

  for (const [i, s] of plan.entries()) {
    const [sec] = await db
      .insert(schema.assessmentSections)
      .values({ assessmentId, title: s.title, sortOrder: i, learningTargetId: s.learningTargetId })
      .returning({ id: schema.assessmentSections.id });
    for (const [j, item] of s.items.entries())
      await db
        .update(schema.assessmentQuestions)
        .set({ sectionId: sec.id, sortOrder: j })
        .where(eq(schema.assessmentQuestions.id, item.rowId));
  }
  await db
    .delete(schema.assessmentSections)
    .where(
      and(
        eq(schema.assessmentSections.id, sections[0].id),
        eq(schema.assessmentSections.assessmentId, assessmentId)
      )
    );
  const other = plan.find((s) => s.learningTargetId === null);
  return { status: "resectioned", sections: plan.length, untargeted: other?.items.length ?? 0 };
}

/** Every summative still in one untargeted section: re-sectioned where nobody has started it. */
export async function resectionAllTests(): Promise<
  { assessmentId: string; title: string; outcome: ResectionOutcome }[]
> {
  const tests = await db
    .select({ id: schema.assessments.id, title: schema.assessments.title })
    .from(schema.assessments)
    .where(eq(schema.assessments.type, "summative"));
  const out = [];
  for (const t of tests) {
    const outcome = await resectionByTarget(t.id);
    if (outcome.status === "skipped" && outcome.reason === "already_sectioned") continue;
    out.push({ assessmentId: t.id, title: t.title, outcome });
  }
  return out;
}

/** The pool name of a test's retake bank for one target. */
export const retakePoolName = (testTitle: string, code: string) =>
  `${testTitle} · ${code} retake bank`;

export type RetakeBankOutcome = {
  /** Bank questions attached to a target section. */
  attached: number;
  /** Bank questions whose target has no section on the test (not used). */
  unplaced: number;
  /** Target codes whose bank cannot mirror the section at every point value. */
  short: string[];
};

/**
 * Rule: a test's retake bank (Jon, Oct 19 2026) is one pool per target section, named
 * "<test> · <code> retake bank" and tagged to the target; the section's `retake_pool_id` points
 * at it. Applying again replaces the pool's questions. A target is "short" when its bank has fewer
 * questions at some point value than the section has, so a retake would reuse original questions.
 */
export async function attachRetakeBank(input: {
  assessmentId: string;
  ownerId: string;
  courseId: string | null;
  testTitle: string;
  questionIds: string[];
}): Promise<RetakeBankOutcome> {
  const sections = await db
    .select({
      id: schema.assessmentSections.id,
      learningTargetId: schema.assessmentSections.learningTargetId,
      code: schema.learningTargets.code,
    })
    .from(schema.assessmentSections)
    .innerJoin(
      schema.learningTargets,
      eq(schema.assessmentSections.learningTargetId, schema.learningTargets.id)
    )
    .where(eq(schema.assessmentSections.assessmentId, input.assessmentId));
  const sectionBy = new Map(sections.map((s) => [s.learningTargetId!, s]));
  const { targets, tagsBy } = await loadTargets(input.courseId, input.questionIds);
  const plan = planTargetSections(
    input.questionIds.map((questionId) => ({
      questionId,
      // Only targets the test has a section for can take bank questions.
      targetIds: (tagsBy.get(questionId) ?? []).filter((id) => sectionBy.has(id)),
    })),
    targets
  );
  let attached = 0;
  let unplaced = 0;
  const short: string[] = [];
  for (const p of plan) {
    const section = p.learningTargetId ? sectionBy.get(p.learningTargetId) : null;
    if (!section) {
      unplaced += p.items.length;
      continue;
    }
    const name = retakePoolName(input.testTitle, section.code);
    let pool = await db.query.questionPools.findFirst({
      columns: { id: true },
      where: and(
        input.courseId
          ? eq(schema.questionPools.courseId, input.courseId)
          : eq(schema.questionPools.ownerId, input.ownerId),
        sql`lower(${schema.questionPools.name}) = ${name.toLowerCase()}`
      ),
    });
    if (!pool)
      [pool] = await db
        .insert(schema.questionPools)
        .values({ ownerId: input.ownerId, courseId: input.courseId, name })
        .returning({ id: schema.questionPools.id });
    await db
      .insert(schema.poolTargets)
      .values({ poolId: pool.id, learningTargetId: section.learningTargetId! })
      .onConflictDoNothing();
    await db.delete(schema.poolQuestions).where(eq(schema.poolQuestions.poolId, pool.id));
    await db
      .insert(schema.poolQuestions)
      .values(p.items.map((q) => ({ poolId: pool.id, questionId: q.questionId })));
    await db
      .update(schema.assessmentSections)
      .set({ retakePoolId: pool.id })
      .where(eq(schema.assessmentSections.id, section.id));
    attached += p.items.length;
    if (
      !(await bankMirrors(
        section.id,
        p.items.map((q) => q.questionId)
      ))
    )
      short.push(section.code);
  }
  // A target section that got no bank questions at all re-serves its own questions on a retake.
  const banked = new Set(plan.map((p) => p.learningTargetId));
  for (const s of sections) if (!banked.has(s.learningTargetId)) short.push(s.code);
  return { attached, unplaced, short };
}

/** Whether a bank has, at every point value, at least as many questions as the section's fixed items. */
async function bankMirrors(sectionId: string, bankIds: string[]): Promise<boolean> {
  const fixed = await db
    .select({ override: schema.assessmentQuestions.points, points: schema.questions.points })
    .from(schema.assessmentQuestions)
    .innerJoin(schema.questions, eq(schema.assessmentQuestions.questionId, schema.questions.id))
    .where(eq(schema.assessmentQuestions.sectionId, sectionId));
  const bank = bankIds.length
    ? await db
        .select({ points: schema.questions.points })
        .from(schema.questions)
        .where(inArray(schema.questions.id, bankIds))
    : [];
  return (
    mirrorShortfall(
      fixed.map((f) => f.override ?? f.points),
      bank.map((b) => b.points)
    ).length === 0
  );
}

/** Rule: the point values at which a bank has fewer questions than the section (empty = it mirrors). */
export function mirrorShortfall(sectionPoints: number[], bankPoints: number[]): number[] {
  const need = new Map<number, number>();
  for (const p of sectionPoints) need.set(p, (need.get(p) ?? 0) + 1);
  for (const p of bankPoints) if (need.has(p)) need.set(p, need.get(p)! - 1);
  return [...need.entries()]
    .filter(([, n]) => n > 0)
    .map(([p]) => p)
    .sort((a, b) => a - b);
}
