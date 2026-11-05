/**
 * Writing one Read · Watch · Do option (relearning revamp R4), shared by the content-pack applier
 * (`src/lib/content-packs.ts`) and the teacher's editor (`src/app/app/practice/relearning/actions.ts`)
 * so both follow one rule: the option is matched by teacher, target and mode, and its sections
 * update in place by position (part + order), so a student partway through keeps their progress
 * (progress is keyed by section and check ids). Sections past the new count are deleted. Callers
 * validate with `relearningIssues` first; this writes what it is given.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PackRelearning } from "@/lib/relearning-pack";

export async function writeRelearningOption(input: {
  ownerId: string;
  targetId: string;
  option: PackRelearning;
  /** Set by the editor (a later pack revision then keeps the teacher's edits); packs leave it. */
  editedAt?: Date;
}): Promise<{ optionId: string; sections: number }> {
  const r = input.option;
  const values = {
    title: r.title.trim(),
    description: r.description?.trim() || null,
    isPublished: r.published ?? true,
    ...(input.editedAt ? { editedAt: input.editedAt } : {}),
  };
  const existing = await db.query.relearningOptions.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.relearningOptions.ownerId, input.ownerId),
      eq(schema.relearningOptions.learningTargetId, input.targetId),
      eq(schema.relearningOptions.mode, r.mode)
    ),
  });
  const optionId = existing
    ? (
        await db
          .update(schema.relearningOptions)
          .set(values)
          .where(eq(schema.relearningOptions.id, existing.id))
          .returning({ id: schema.relearningOptions.id })
      )[0].id
    : (
        await db
          .insert(schema.relearningOptions)
          .values({
            ...values,
            ownerId: input.ownerId,
            learningTargetId: input.targetId,
            mode: r.mode,
          })
          .returning({ id: schema.relearningOptions.id })
      )[0].id;
  const current = await db.query.relearningSections.findMany({
    columns: { id: true, part: true, sortOrder: true },
    where: eq(schema.relearningSections.optionId, optionId),
  });
  const keep = new Set<string>();
  let sections = 0;
  for (const part of ["core", "extension"] as const) {
    const wanted = r.sections.filter((x) => x.part === part);
    for (const [i, sec] of wanted.entries()) {
      const row = {
        title: sec.title?.trim() || null,
        body: sec.body,
        checks: sec.checks ?? [],
        shortAnswerPrompt: sec.shortAnswer?.trim() || null,
        estMinutes: sec.minutes ?? 3,
      };
      const same = current.find((c) => c.part === part && c.sortOrder === i);
      if (same) {
        await db
          .update(schema.relearningSections)
          .set(row)
          .where(eq(schema.relearningSections.id, same.id));
        keep.add(same.id);
      } else {
        const [made] = await db
          .insert(schema.relearningSections)
          .values({ ...row, optionId, part, sortOrder: i })
          .returning({ id: schema.relearningSections.id });
        keep.add(made.id);
      }
      sections++;
    }
  }
  const extra = current.filter((c) => !keep.has(c.id)).map((c) => c.id);
  if (extra.length)
    await db.delete(schema.relearningSections).where(inArray(schema.relearningSections.id, extra));
  return { optionId, sections };
}
