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
