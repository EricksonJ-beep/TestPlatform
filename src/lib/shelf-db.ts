/**
 * Persist a unit-shelf placement (src/lib/unit-shelves.ts) for a bank or an
 * assessment. Callers have already passed requireOwner for the moved item;
 * this checks the unit is one of the item's course's units and then writes
 * the unit and the shelf order. Ids in `orderedIds` that are not the owner's,
 * or not in the same course, are ignored rather than failing the drop.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { ActionError } from "@/lib/authz";

type ShelfTable = typeof schema.questionBanks | typeof schema.assessments;

export async function placeOnShelf(
  table: ShelfTable,
  ownerId: string,
  id: string,
  unitId: string | null,
  orderedIds: string[]
): Promise<void> {
  const t = table as typeof schema.questionBanks;
  const [item] = await db
    .select({ courseId: t.courseId })
    .from(t)
    .where(and(eq(t.id, id), eq(t.ownerId, ownerId)));
  if (!item) throw new ActionError("Not found.", 404);
  if (unitId !== null) {
    const unit = await db.query.units.findFirst({
      columns: { courseId: true },
      where: eq(schema.units.id, unitId),
    });
    if (!unit || !item.courseId || unit.courseId !== item.courseId)
      throw new ActionError("That unit belongs to a different course.", 400);
  }
  await db.update(t).set({ unitId }).where(eq(t.id, id));

  const ids = Array.from(new Set([...orderedIds.map(String), id]));
  const mine = await db
    .select({ id: t.id })
    .from(t)
    .where(
      and(
        inArray(t.id, ids),
        eq(t.ownerId, ownerId),
        item.courseId ? eq(t.courseId, item.courseId) : undefined,
        unitId === null ? undefined : eq(t.unitId, unitId)
      )
    );
  const allowed = new Set(mine.map((r) => r.id));
  let i = 0;
  for (const rowId of ids) {
    if (!allowed.has(rowId)) continue;
    await db.update(t).set({ sortOrder: i++ }).where(eq(t.id, rowId));
  }
}
