/**
 * Reads for the teacher's Read · Watch · Do editor (Nov 5 2026): a course's targets with the
 * teacher's three options each, and one option with its sections. Callers check ownership first.
 */
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { QuickCheck, RelearningSectionBody } from "@/db/schema";
import type { RelearningMode } from "@/lib/relearning";

export type OptionCell = {
  id: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  editedAt: Date | null;
  /** Minutes in the core sections, and in the extension sections. */
  coreMinutes: number;
  extensionMinutes: number;
  sections: number;
  checks: number;
  /** Students working through it right now (a save reaches them on their next load). */
  inProgress: number;
};

export type TargetRow = {
  id: string;
  code: string;
  title: string;
  unitName: string | null;
  options: Partial<Record<RelearningMode, OptionCell>>;
};

/** Every target on the course, in unit then target order, with the teacher's option per mode. */
export async function listRelearningGrid(
  teacherId: string,
  courseId: string
): Promise<TargetRow[]> {
  const targets = await db
    .select({
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
      unitName: schema.units.name,
    })
    .from(schema.learningTargets)
    .leftJoin(schema.units, eq(schema.units.id, schema.learningTargets.unitId))
    .where(eq(schema.learningTargets.courseId, courseId))
    .orderBy(
      asc(schema.units.sortOrder),
      asc(schema.learningTargets.sortOrder),
      asc(schema.learningTargets.code)
    );
  if (!targets.length) return [];
  const options = await db
    .select()
    .from(schema.relearningOptions)
    .where(
      and(
        eq(schema.relearningOptions.ownerId, teacherId),
        inArray(
          schema.relearningOptions.learningTargetId,
          targets.map((t) => t.id)
        )
      )
    );
  const optionIds = options.map((o) => o.id);
  const [sections, active] = optionIds.length
    ? await Promise.all([
        db
          .select({
            optionId: schema.relearningSections.optionId,
            part: schema.relearningSections.part,
            estMinutes: schema.relearningSections.estMinutes,
            checks: schema.relearningSections.checks,
          })
          .from(schema.relearningSections)
          .where(inArray(schema.relearningSections.optionId, optionIds)),
        db
          .select({ optionId: schema.relearningPaths.optionId, n: count() })
          .from(schema.relearningPaths)
          .where(
            and(
              inArray(schema.relearningPaths.optionId, optionIds),
              isNull(schema.relearningPaths.finishedAt)
            )
          )
          .groupBy(schema.relearningPaths.optionId),
      ])
    : [[], []];
  const byTarget = new Map(targets.map((t) => [t.id, {} as TargetRow["options"]]));
  for (const o of options) {
    const mine = sections.filter((s) => s.optionId === o.id);
    const minutes = (part: "core" | "extension") =>
      mine.filter((s) => s.part === part).reduce((n, s) => n + s.estMinutes, 0);
    byTarget.get(o.learningTargetId)![o.mode] = {
      id: o.id,
      title: o.title,
      description: o.description,
      isPublished: o.isPublished,
      editedAt: o.editedAt,
      coreMinutes: minutes("core"),
      extensionMinutes: minutes("extension"),
      sections: mine.length,
      checks: mine.reduce((n, s) => n + s.checks.length, 0),
      inProgress: active.find((a) => a.optionId === o.id)?.n ?? 0,
    };
  }
  return targets.map((t) => ({ ...t, options: byTarget.get(t.id) ?? {} }));
}

export type EditorTarget = {
  id: string;
  code: string;
  title: string;
  courseId: string;
  courseName: string;
};

/** A target with its course, for the editor's heading and the create action. */
export async function getEditorTarget(targetId: string): Promise<EditorTarget | null> {
  const [row] = await db
    .select({
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
      courseId: schema.courses.id,
      courseName: schema.courses.name,
    })
    .from(schema.learningTargets)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.learningTargets.courseId))
    .where(eq(schema.learningTargets.id, targetId))
    .limit(1);
  return row ?? null;
}

export type EditorOption = {
  id: string;
  mode: RelearningMode;
  title: string;
  description: string | null;
  isPublished: boolean;
  editedAt: Date | null;
  target: EditorTarget;
  sections: {
    id: string;
    part: "core" | "extension";
    sortOrder: number;
    title: string | null;
    body: RelearningSectionBody;
    checks: QuickCheck[];
    shortAnswerPrompt: string | null;
    estMinutes: number;
    mediaAssetId: string | null;
  }[];
  inProgress: number;
};

/** One option with its target, course and sections (core then extension, each in order). */
export async function getEditorOption(optionId: string): Promise<EditorOption | null> {
  const option = await db.query.relearningOptions.findFirst({
    where: eq(schema.relearningOptions.id, optionId),
  });
  if (!option) return null;
  const target = await getEditorTarget(option.learningTargetId);
  if (!target) return null;
  const [sections, [active]] = await Promise.all([
    db
      .select({
        id: schema.relearningSections.id,
        part: schema.relearningSections.part,
        sortOrder: schema.relearningSections.sortOrder,
        title: schema.relearningSections.title,
        body: schema.relearningSections.body,
        checks: schema.relearningSections.checks,
        shortAnswerPrompt: schema.relearningSections.shortAnswerPrompt,
        estMinutes: schema.relearningSections.estMinutes,
        mediaAssetId: schema.relearningSections.mediaAssetId,
      })
      .from(schema.relearningSections)
      .where(eq(schema.relearningSections.optionId, optionId))
      .orderBy(asc(schema.relearningSections.part), asc(schema.relearningSections.sortOrder)),
    db
      .select({ n: count() })
      .from(schema.relearningPaths)
      .where(
        and(
          eq(schema.relearningPaths.optionId, optionId),
          isNull(schema.relearningPaths.finishedAt)
        )
      ),
  ]);
  return {
    id: option.id,
    mode: option.mode,
    title: option.title,
    description: option.description,
    isPublished: option.isPublished,
    editedAt: option.editedAt,
    target,
    sections,
    inProgress: active?.n ?? 0,
  };
}
