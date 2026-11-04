/**
 * Lunch codes from a pasted roster (Jon, Nov 5 2026): students log into Bloom with a username, so
 * Skyward's "Other ID" can't come from their email. The teacher pastes the school roster (lines
 * like "DOE, JANE A.   09   1234@school.org", or "Jane Doe 1234") and each line's code is matched
 * to a student by name. Pure.
 */

export type RosterLine = { line: number; first: string; last: string; code: string };

/** Letters only, lower case: "Van Dyke" and "VAN DYKE" match, so do hyphenated spellings. */
export function nameKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

/** Each line with a name and a 3–7 digit code (the digits before an @ count). Others are skipped. */
export function parseLunchCodes(text: string): RosterLine[] {
  const out: RosterLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const m = raw.match(/(?:^|[\s,;\t])(\d{3,7})(?=@|[\s,;\t]|$)/);
    if (!m || m.index === undefined) return;
    // The name is what comes before the code, less a grade column ("09").
    const before = raw
      .slice(0, m.index)
      .replace(/[\s,;\t]+\d{1,2}[\s,;\t]*$/, "")
      .trim();
    if (!before) return;
    let first = "";
    let last = "";
    if (before.includes(",")) {
      const [l, f = ""] = before.split(",");
      last = l.trim();
      first = f.trim().split(/\s+/)[0] ?? "";
    } else {
      const parts = before.split(/\s+/);
      first = parts[0];
      last = parts.slice(1).join(" ");
    }
    if (first && last) out.push({ line: i + 1, first, last, code: m[1] });
  });
  return out;
}

export type StudentName = { id: string; firstName: string; lastName: string };

/**
 * Rule: a roster line matches the student with the same last and first name; failing that, the
 * only student with that last name whose first name starts the same way. A student matched twice
 * keeps the first line.
 */
export function matchLunchCodes(
  lines: RosterLine[],
  students: StudentName[]
): { matched: { studentId: string; code: string }[]; unmatched: RosterLine[] } {
  const matched = new Map<string, string>();
  const unmatched: RosterLine[] = [];
  for (const l of lines) {
    const last = nameKey(l.last);
    const first = nameKey(l.first);
    const sameLast = students.filter((s) => nameKey(s.lastName) === last);
    const exact = sameLast.filter((s) => nameKey(s.firstName) === first);
    const loose = sameLast.filter(
      (s) => nameKey(s.firstName).startsWith(first) || first.startsWith(nameKey(s.firstName))
    );
    const hit =
      exact.length === 1 ? exact[0] : exact.length === 0 && loose.length === 1 ? loose[0] : null;
    if (!hit) unmatched.push(l);
    else if (!matched.has(hit.id)) matched.set(hit.id, l.code);
  }
  return {
    matched: [...matched.entries()].map(([studentId, code]) => ({ studentId, code })),
    unmatched,
  };
}
