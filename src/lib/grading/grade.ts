/**
 * One function per question type. Pure: no database, no dates, no randomness.
 * Every grader returns points earned out of points possible; blank answers are
 * wrong, never "skipped" (PLAN.md §5: "blank answers count as wrong").
 */
import type { Answer, GradableQuestion, GradeResult } from "./types";

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

function wrong(q: GradableQuestion, note?: string): GradeResult {
  return { pointsPossible: q.points, pointsEarned: 0, isCorrect: false, note };
}
function right(q: GradableQuestion, detail?: Record<string, boolean>): GradeResult {
  return { pointsPossible: q.points, pointsEarned: q.points, isCorrect: true, detail };
}
function pending(q: GradableQuestion): GradeResult {
  return { pointsPossible: q.points, pointsEarned: null, isCorrect: null };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

export function gradeChoice(q: GradableQuestion, a: Answer): GradeResult {
  if (!a || a.kind !== "choice" || !a.optionId) return wrong(q, "No answer.");
  const chosen = q.options.find((o) => o.id === a.optionId);
  if (!chosen) return wrong(q, "That option isn't on this question.");
  return chosen.isCorrect ? right(q, { [chosen.id]: true }) : wrong(q, "Not the correct option.");
}

export function gradeMultiSelect(q: GradableQuestion, a: Answer): GradeResult {
  const cfg = (q.gradingConfig ?? {}) as { partialCredit?: boolean };
  const chosen = new Set(a && a.kind === "multi" ? a.optionIds : []);
  const correct = q.options.filter((o) => o.isCorrect).map((o) => o.id);
  const detail: Record<string, boolean> = {};
  let hits = 0;
  let misses = 0;
  for (const o of q.options) {
    const picked = chosen.has(o.id);
    detail[o.id] = picked === o.isCorrect;
    if (picked && o.isCorrect) hits++;
    if (picked && !o.isCorrect) misses++;
  }
  if (correct.length === 0) return wrong(q, "Question has no correct option.");
  const exact = hits === correct.length && misses === 0;
  if (!cfg.partialCredit) {
    return exact
      ? right(q, detail)
      : {
          pointsPossible: q.points,
          pointsEarned: 0,
          isCorrect: false,
          detail,
          note: chosen.size ? "Select all that apply, and only those." : "No answer.",
        };
  }
  // Partial credit: each correct pick earns, each wrong pick costs, floor at zero.
  const fraction = Math.max(0, (hits - misses) / correct.length);
  const earned = round2(q.points * fraction);
  return {
    pointsPossible: q.points,
    pointsEarned: earned,
    isCorrect: exact,
    detail,
    note: exact ? undefined : `${hits} of ${correct.length} correct, ${misses} incorrect selected.`,
  };
}

export function gradeFillBlank(q: GradableQuestion, a: Answer): GradeResult {
  const cfg = (q.gradingConfig ?? {}) as { acceptedAnswers?: string[]; caseSensitive?: boolean };
  const text = a && a.kind === "text" ? a.text : "";
  if (!text.trim()) return wrong(q, "No answer.");
  const accepted = cfg.acceptedAnswers ?? [];
  const given = cfg.caseSensitive ? text.trim().replace(/\s+/g, " ") : norm(text);
  const ok = accepted.some(
    (x) => (cfg.caseSensitive ? x.trim().replace(/\s+/g, " ") : norm(x)) === given
  );
  return ok ? right(q) : wrong(q, "Not one of the accepted answers.");
}

export function gradeShortAnswer(q: GradableQuestion, a: Answer): GradeResult {
  if (q.grading === "manual") return pending(q);
  const cfg = (q.gradingConfig ?? {}) as { keywords?: string[]; minMatches?: number };
  const keywords = (cfg.keywords ?? []).map(norm).filter(Boolean);
  if (keywords.length === 0) return pending(q);
  const text = norm(a && a.kind === "text" ? a.text : "");
  if (!text) return wrong(q, "No answer.");
  const matches = keywords.filter((k) => text.includes(k)).length;
  const need = Math.max(1, cfg.minMatches ?? 1);
  return matches >= need
    ? right(q)
    : wrong(q, `Mentions ${matches} of the ${need} expected idea(s).`);
}

export function gradeExtendedResponse(q: GradableQuestion, a: Answer): GradeResult {
  const text = a && a.kind === "text" ? a.text.trim() : "";
  if (!text) return wrong(q, "No answer.");
  return pending(q);
}

export type NumericConfig = {
  mode?: "exact" | "tolerance" | "percent_tolerance" | "range";
  answer?: number;
  tolerance?: number;
  percent?: number;
  min?: number;
  max?: number;
  unit?: string | null;
};

/** Squash spaces, superscripts, and case so "m/s", "m / s", and "M/S" compare equal. */
const normUnit = (u: string) =>
  u.replace(/\s+/g, "").replace(/\^/g, "").replace(/²/g, "2").replace(/³/g, "3").toLowerCase();

/**
 * Parse "15", "15 m/s", "15m/s", "1,500", "-2.5e3", "3/4". Returns the number and
 * any trailing unit text. Unit-aware matching happens in gradeNumeric.
 */
export function parseNumericInput(raw: string): { value: number; unit: string } | null {
  const s = raw.trim().replace(/,/g, "").replace(/^\+/, "");
  // Fractions first, so "3/4" is a value rather than 3 with the unit "/4".
  const m = s.match(/^(-?\d+\/\d+|-?\d*\.?\d+(?:e[+-]?\d+)?)\s*(.*)$/i);
  if (!m) return null;
  let value: number;
  if (m[1].includes("/")) {
    const [n, d] = m[1].split("/").map(Number);
    if (!d) return null;
    value = n / d;
  } else value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  return { value, unit: m[2].trim() };
}

export function gradeNumeric(q: GradableQuestion, a: Answer): GradeResult {
  const cfg = (q.gradingConfig ?? {}) as NumericConfig;
  const raw = a && a.kind === "text" ? a.text : "";
  if (!raw.trim()) return wrong(q, "No answer.");
  const parsed = parseNumericInput(raw);
  if (!parsed) return wrong(q, "Couldn't read a number.");
  if (parsed.unit) {
    // With a unit set, the unit may be given or omitted but must not be a different one.
    if (!cfg.unit || normUnit(parsed.unit) !== normUnit(cfg.unit))
      return wrong(q, cfg.unit ? `Expected the unit ${cfg.unit}.` : "No unit expected.");
  }
  const x = parsed.value;
  const mode = cfg.mode ?? "exact";
  let ok = false;
  if (mode === "range")
    ok = cfg.min !== undefined && cfg.max !== undefined && x >= cfg.min && x <= cfg.max;
  else if (cfg.answer === undefined || cfg.answer === null) ok = false;
  else if (mode === "exact")
    ok = Math.abs(x - cfg.answer) <= Math.max(1e-9, Math.abs(cfg.answer) * 1e-9);
  else if (mode === "tolerance") ok = Math.abs(x - cfg.answer) <= (cfg.tolerance ?? 0) + 1e-12;
  else if (mode === "percent_tolerance")
    ok = Math.abs(x - cfg.answer) <= (Math.abs(cfg.answer) * (cfg.percent ?? 0)) / 100 + 1e-12;
  return ok
    ? right(q)
    : wrong(
        q,
        mode === "range" ? "Outside the accepted range." : "Not within the accepted tolerance."
      );
}

export function gradeMatching(q: GradableQuestion, a: Answer): GradeResult {
  const pairs = a && a.kind === "match" ? a.pairs : {};
  const lefts = q.options.filter((o) => o.matchText !== null);
  if (lefts.length === 0) return wrong(q, "Question has no pairs.");
  const detail: Record<string, boolean> = {};
  let hits = 0;
  for (const o of lefts) {
    const ok = norm(pairs[o.id] ?? "") === norm(o.matchText ?? "");
    detail[o.id] = ok;
    if (ok) hits++;
  }
  const earned = round2(q.points * (hits / lefts.length));
  return {
    pointsPossible: q.points,
    pointsEarned: earned,
    isCorrect: hits === lefts.length,
    detail,
    note: hits === lefts.length ? undefined : `${hits} of ${lefts.length} pairs matched.`,
  };
}

export function gradeOrdering(q: GradableQuestion, a: Answer): GradeResult {
  const given = a && a.kind === "order" ? a.optionIds : [];
  const correct = [...q.options]
    .filter((o) => o.correctPosition !== null)
    .sort((x, y) => (x.correctPosition ?? 0) - (y.correctPosition ?? 0))
    .map((o) => o.id);
  if (correct.length === 0) return wrong(q, "Question has no order.");
  if (given.length === 0) return wrong(q, "No answer.");
  const exact = given.length === correct.length && given.every((id, i) => id === correct[i]);
  const detail: Record<string, boolean> = {};
  correct.forEach((id, i) => (detail[id] = given[i] === id));
  return exact
    ? right(q, detail)
    : {
        pointsPossible: q.points,
        pointsEarned: 0,
        isCorrect: false,
        detail,
        note: "Not in the correct order.",
      };
}

/** Dispatch by type. Image hotspot is Phase 2 and grades as pending manual until then. */
export function gradeResponse(q: GradableQuestion, a: Answer): GradeResult {
  switch (q.type) {
    case "multiple_choice":
    case "true_false":
      return gradeChoice(q, a);
    case "multiple_select":
      return gradeMultiSelect(q, a);
    case "fill_blank":
      return gradeFillBlank(q, a);
    case "short_answer":
      return gradeShortAnswer(q, a);
    case "extended_response":
      return gradeExtendedResponse(q, a);
    case "numeric":
      return gradeNumeric(q, a);
    case "matching":
      return gradeMatching(q, a);
    case "ordering":
      return gradeOrdering(q, a);
    case "image_hotspot":
      return pending(q);
  }
}
