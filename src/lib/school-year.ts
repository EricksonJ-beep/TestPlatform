/**
 * School years (Jon, Nov 20 2026: "add the school year when creating a new class"). Pure.
 * A school year is written "2026-27" and turns over on July 1 on the school's clock.
 */
import { schoolDate } from "@/lib/reopen";

const label = (start: number) => `${start}-${String((start + 1) % 100).padStart(2, "0")}`;

/** The school year `at` falls in: July to December belong to the year starting then. */
export function schoolYearOf(at: Date): string {
  const { y, m } = schoolDate(at);
  return label(m >= 7 ? y : y - 1);
}

/** Last year, this year and next year, for the New class form's choices. */
export function schoolYearChoices(at: Date): string[] {
  const start = Number(schoolYearOf(at).slice(0, 4));
  return [label(start - 1), label(start), label(start + 1)];
}

export const SCHOOL_YEAR_TEXT = "Use a school year like 2026-27.";

/** A typed school year, tidied: "2026-27", with "2026-2027", "2026/27" and "2026–27" accepted. */
export function parseSchoolYear(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})\s*[-–/]\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  const start = Number(m[1]);
  return label(start).endsWith(m[2].slice(-2)) ? label(start) : null;
}
