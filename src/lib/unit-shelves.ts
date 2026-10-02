/**
 * Unit shelves (Jon, Oct 2 2026): the Question banks and Assessments pages
 * show each course like a Google Classroom stream, one header per unit, with
 * the teacher's own order inside each unit. A card with no unit sits under
 * "No unit yet" at the end of its course. Pure helpers; the pages and the
 * drag board call these, the actions persist the result.
 */

export type Shelved = {
  id: string;
  courseId: string | null;
  courseName: string | null;
  unitId: string | null;
  sortOrder: number;
};

export type UnitRef = { id: string; courseId: string; name: string; sortOrder: number };

export type UnitShelf<T> = { unitId: string | null; name: string; items: T[] };
export type CourseShelves<T> = {
  courseId: string | null;
  course: string;
  shelves: UnitShelf<T>[];
};

export const NO_UNIT = "No unit yet";
export const NO_COURSE = "No course";

const byOrder = <T extends Shelved>(a: T, b: T) => a.sortOrder - b.sortOrder;

/**
 * Group items under course → unit. Every unit of a course appears, even when
 * empty, so there is always a shelf to drop a card onto; the "No unit yet"
 * shelf appears only when something is on it. Courses sort by name (no course
 * last); units by their own order; items by their saved order.
 */
export function groupByUnit<T extends Shelved>(items: T[], units: UnitRef[]): CourseShelves<T>[] {
  const courses = new Map<string | null, { course: string; items: T[] }>();
  for (const item of items) {
    const key = item.courseId ?? null;
    const entry = courses.get(key) ?? { course: item.courseName ?? NO_COURSE, items: [] };
    entry.items.push(item);
    courses.set(key, entry);
  }
  return [...courses]
    .sort(([ka, a], [kb, b]) =>
      ka === null
        ? 1
        : kb === null
          ? -1
          : a.course.localeCompare(b.course, undefined, { numeric: true })
    )
    .map(([courseId, { course, items }]) => {
      const courseUnits = units
        .filter((u) => u.courseId === courseId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      const known = new Set(courseUnits.map((u) => u.id));
      const shelves: UnitShelf<T>[] = courseUnits.map((u) => ({
        unitId: u.id,
        name: u.name,
        items: items.filter((i) => i.unitId === u.id).sort(byOrder),
      }));
      const loose = items.filter((i) => i.unitId === null || !known.has(i.unitId)).sort(byOrder);
      if (loose.length || shelves.length === 0)
        shelves.push({ unitId: null, name: NO_UNIT, items: loose });
      return { courseId, course, shelves };
    });
}

/**
 * Where a dragged card lands. Dropping on another card puts it in that card's
 * shelf, in front of it; dropping on a shelf header puts it at the end of that
 * shelf. Returns the shelf's new id order (dragged card included) and the
 * unit it now belongs to.
 */
export function placeCard<T extends Shelved>(
  shelves: UnitShelf<T>[],
  draggedId: string,
  target: { cardId: string } | { unitId: string | null }
): { unitId: string | null; orderedIds: string[] } | null {
  const from = shelves.find((s) => s.items.some((i) => i.id === draggedId));
  if (!from) return null;
  const to =
    "cardId" in target
      ? shelves.find((s) => s.items.some((i) => i.id === target.cardId))
      : shelves.find((s) => s.unitId === target.unitId);
  if (!to) return null;
  if ("cardId" in target && target.cardId === draggedId) return null;
  const ids = to.items.map((i) => i.id).filter((id) => id !== draggedId);
  if ("cardId" in target) {
    const at = ids.indexOf(target.cardId);
    ids.splice(at < 0 ? ids.length : at, 0, draggedId);
  } else ids.push(draggedId);
  return { unitId: to.unitId, orderedIds: ids };
}

/** Swap a card with its neighbour in the same shelf (keyboard fallback for the drag). */
export function nudgeCard<T extends Shelved>(
  shelf: UnitShelf<T>,
  id: string,
  delta: -1 | 1
): string[] | null {
  const ids = shelf.items.map((i) => i.id);
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}
