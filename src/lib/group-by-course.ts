/**
 * Group list cards (banks, assessments) under one heading per course so each
 * class's material sits in its own basket (Jon, Sept 28 2026). Courses sort by
 * name; items with no course come last.
 */
export const NO_COURSE = "No course";

export function groupByCourse<T extends { courseName: string | null }>(
  items: T[]
): { course: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.courseName ?? NO_COURSE;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups]
    .sort(([a], [b]) =>
      a === NO_COURSE ? 1 : b === NO_COURSE ? -1 : a.localeCompare(b, undefined, { numeric: true })
    )
    .map(([course, items]) => ({ course, items }));
}
