/**
 * The Skyward export (Jon, Nov 3–4 2026; docs/relearning-revamp-plan.md, rules K1–K2, ticket R8).
 * Skyward imports one assignment at a time from a CSV of Last Name, First Name, Other ID and Score.
 * Jon enters quizzes per learning target ("F_LT3U2") and tests as one score ("S_LT1,2,3,4U2"), as
 * percents (he's moving every column to 100 points). Pure: the query module reads the scores, this
 * builds the files.
 */
import { toCsv } from "@/lib/csv";

/** Skyward's import columns (K1); the first line of every file. */
export const SKYWARD_HEADER = ["Last Name", "First Name", "ID", "Score"] as const;

/**
 * The student's Skyward "Other ID" (K2): their lunch code, which is the digits before the @ in their
 * Cadott email (decision 24). Null when the email is missing or its name part isn't all digits.
 */
export function skywardId(email: string | null | undefined): string | null {
  const local = email?.trim().split("@")[0] ?? "";
  return /^\d+$/.test(local) ? local : null;
}

/** A percent as Skyward takes it: a whole number, halves rounded up (K1). Blank when there's none. */
export function skywardScore(percent: number | null | undefined): number | null {
  if (percent === null || percent === undefined || Number.isNaN(percent)) return null;
  return Math.floor(percent + 0.5);
}

/** "U3.LT1" → { unit: 3, lt: 1 }; null when the code doesn't name both. */
export function parseTargetCode(code: string): { unit: number; lt: number } | null {
  const m = /U\s*(\d+)\s*[.\-_ ]?\s*LT\s*(\d+)/i.exec(code);
  return m ? { unit: Number(m[1]), lt: Number(m[2]) } : null;
}

const safe = (s: string) => s.replace(/[^\w,.-]+/g, "");

/**
 * File names that follow Jon's Skyward columns (K1): a quiz target "U2.LT3" → "F_LT3U2"; a test on
 * U2.LT1–LT4 → "S_LT1,2,3,4U2". Codes that don't read as unit + target fall back to the code.
 */
export function skywardFileName(
  input: { kind: "target"; code: string } | { kind: "test"; codes: string[] }
): string {
  if (input.kind === "target") {
    const p = parseTargetCode(input.code);
    return p ? `F_LT${p.lt}U${p.unit}` : `F_${safe(input.code)}`;
  }
  const parsed = input.codes.map(parseTargetCode);
  const units = new Set(parsed.map((p) => p?.unit));
  if (parsed.length && parsed.every((p) => p) && units.size === 1) {
    const lts = parsed.map((p) => p!.lt).sort((a, b) => a - b);
    return `S_LT${lts.join(",")}U${parsed[0]!.unit}`;
  }
  return `S_${safe(input.codes.join(",")) || "test"}`;
}

export type SkywardStudent = {
  lastName: string;
  firstName: string;
  email: string | null;
  /** The counting percent for this file's column; null with no finished attempt. */
  percent: number | null;
};

export type SkywardFile = {
  /** Suggested file name, without ".csv". */
  name: string;
  /** What the file holds, for the page: "U2.LT3" or "Whole test". */
  label: string;
  csv: string;
  rows: number;
};

/** One file: the header, then a row per student, last name first (K1). */
export function skywardCsv(students: SkywardStudent[]): string {
  return toCsv(
    [...SKYWARD_HEADER],
    [...students]
      .sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName) ||
          a.firstName.localeCompare(b.firstName) ||
          (a.email ?? "").localeCompare(b.email ?? "")
      )
      .map((s) => [s.lastName, s.firstName, skywardId(s.email), skywardScore(s.percent)])
  );
}

/** The students whose email gives no Skyward ID, for the page's list (K2). */
export function missingIds(
  students: { lastName: string; firstName: string; email: string | null }[]
): { name: string; email: string | null }[] {
  return students
    .filter((s) => skywardId(s.email) === null)
    .map((s) => ({ name: `${s.firstName} ${s.lastName}`, email: s.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
