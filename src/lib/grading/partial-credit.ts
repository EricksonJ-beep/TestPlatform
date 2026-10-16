/**
 * Partial-credit answers on numeric questions, written the way a teacher types them:
 * "3 = 50%" or "3=0.5", several separated by ";" or "|". Pure; shared by the CSV
 * importer and the question editor so both read the same text the same way.
 */
export type PartialCredit = { answer: number; credit: number };

/** Parse "3 = 50%; 4 = 25%". Returns the list, or an error message for the first piece it can't read. */
export function parsePartialCredit(
  text: string
): { ok: true; partial: PartialCredit[] } | { ok: false; error: string } {
  const partial: PartialCredit[] = [];
  for (const piece of text.split(/[;|\n]/)) {
    const s = piece.trim();
    if (!s) continue;
    const m = s.match(/^(-?[\d,]*\.?\d+)\s*[=:]\s*(\d*\.?\d+)\s*(%?)$/);
    if (!m) return { ok: false, error: `Write partial credit like "3 = 50%" (got "${s}").` };
    const answer = Number(m[1].replace(/,/g, ""));
    const credit = m[3] ? Number(m[2]) / 100 : Number(m[2]);
    if (!Number.isFinite(answer) || !(credit > 0 && credit < 1))
      return {
        ok: false,
        error: `Partial credit must be more than 0% and less than 100% ("${s}").`,
      };
    partial.push({ answer, credit });
  }
  return { ok: true, partial };
}

/** The editor's text form of a stored list: "3 = 50%; 4 = 25%". */
export function formatPartialCredit(partial: PartialCredit[] | undefined | null): string {
  return (partial ?? []).map((p) => `${p.answer} = ${Math.round(p.credit * 100)}%`).join("; ");
}
