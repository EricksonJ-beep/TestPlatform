/**
 * Which class period the Dashboard's gradebook opens on (Jon, Oct 13 2026, dashboard plan
 * decision 8: "always the period the teacher picked last"). The gradebook follows the sidebar
 * course (decision 1), so the cookie remembers the last pick per course: a short list of class
 * ids, newest first, and the first one that is a class of the current course wins. The server
 * checks every id against the teacher's own classes on that course before using it, so a stale
 * or forged cookie can only ever fall back to the course's first period. Pure.
 */

export const CLASS_COOKIE = "bloom.class";

/** Enough to remember a pick in every course a teacher is likely to have. */
const KEEP = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The remembered class ids, newest first; anything that is not an id is dropped. */
export function parseRememberedClasses(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").filter((id) => UUID.test(id)))].slice(0, KEEP);
}

/** The cookie value after picking `classId`: it moves to the front, the list stays short. */
export function rememberClassList(remembered: string[], classId: string): string {
  return [classId, ...remembered.filter((id) => id !== classId)].slice(0, KEEP).join(",");
}

/**
 * Rule (decision 8): the period the teacher picked last in this course, else the course's first
 * class in the teacher's own order (the Classes page order); null when the course has none.
 * `classes` are the teacher's own classes on the current course, so an id from anywhere else
 * never matches.
 */
export function pickPeriod<T extends { id: string }>(classes: T[], remembered: string[]): T | null {
  for (const id of remembered) {
    const hit = classes.find((c) => c.id === id);
    if (hit) return hit;
  }
  return classes[0] ?? null;
}

/** A period chip's words: "P3" (as `placeLabel` writes a period), or the class name without one. */
export function periodLabel(c: { name: string; period: string | null }): string {
  const period = c.period?.trim();
  return period ? `P${period.replace(/^p(eriod)?\s*/i, "")}` : c.name;
}
