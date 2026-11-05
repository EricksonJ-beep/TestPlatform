/**
 * Bank health (relearning revamp "Teacher side"): each Practice bank's count by difficulty band
 * and question type, per learning target, flagged when a band can't fill a deal. Pure; it counts
 * what the practice-check dealer can draw (`checkable`: live, auto-graded, tagged to the target),
 * so the numbers here and the dealer's never disagree.
 */
import type { QuestionType } from "@/db/types";
import { difficultyBand, type DifficultyBand } from "@/lib/assessments/serve";
import { checkable } from "@/lib/practice-check";

export const BANDS: DifficultyBand[] = ["easy", "medium", "hard"];

/**
 * One deal's worth of each band: the larger of a practice check (3 easy · 1 medium · 1 hard,
 * decision 11) and a 10-question practice set (DEAL_MIX: 3 · 4 · 3).
 */
export const DEAL_NEED: Record<DifficultyBand, number> = { easy: 3, medium: 4, hard: 3 };

/** Fewer than this many deals' worth of fresh questions in a band reads as thin. */
export const THIN_DEALS = 3;

/** short: can't fill one deal (the dealer borrows from other bands) · thin: under 3 fresh deals. */
export type BandStatus = "short" | "thin" | "ok";

const RANK: Record<BandStatus, number> = { short: 0, thin: 1, ok: 2 };

export function bandStatus(count: number, band: DifficultyBand): BandStatus {
  return count < DEAL_NEED[band] ? "short" : count < DEAL_NEED[band] * THIN_DEALS ? "thin" : "ok";
}

export function worstStatus(statuses: BandStatus[]): BandStatus {
  return statuses.reduce<BandStatus>((w, s) => (RANK[s] < RANK[w] ? s : w), "ok");
}

export type HealthQuestion = {
  difficulty: number;
  type: QuestionType;
  grading: "auto" | "manual";
  /** The learning targets it's tagged to (any course; only `targets` are counted). */
  targetIds: string[];
};

export type TargetHealth = {
  id: string;
  code: string;
  title: string;
  /** Questions the dealer can draw for this target. */
  total: number;
  bands: Record<DifficultyBand, number>;
  status: Record<DifficultyBand, BandStatus>;
  worst: BandStatus;
  /** Count per question type, most first. */
  types: { type: QuestionType; count: number }[];
};

export type BankHealth = {
  targets: TargetHealth[];
  /** Questions the dealer can use for at least one target. */
  usable: number;
  /** Live questions it never deals: teacher-graded or a type it can't grade. */
  notAutoGraded: number;
  /** Live auto-graded questions tagged to no learning target of the course. */
  untagged: number;
  /** Worst band across targets; "short" when nothing is usable at all. */
  worst: BandStatus;
};

/**
 * Rule: per target (in the order given, only those with at least one question here), count the
 * checkable questions tagged to it by band and type; each band is short below one deal, thin below
 * three, otherwise ok. A question tagged to two targets counts for both.
 */
export function bankHealth(
  questions: HealthQuestion[],
  targets: { id: string; code: string; title: string }[]
): BankHealth {
  const known = new Set(targets.map((t) => t.id));
  const per = new Map<
    string,
    { bands: Record<DifficultyBand, number>; types: Map<QuestionType, number> }
  >();
  let usable = 0;
  let notAutoGraded = 0;
  let untagged = 0;
  for (const q of questions) {
    if (!checkable(q)) {
      notAutoGraded++;
      continue;
    }
    const mine = q.targetIds.filter((id) => known.has(id));
    if (mine.length === 0) {
      untagged++;
      continue;
    }
    usable++;
    const band = difficultyBand(q.difficulty);
    for (const id of mine) {
      const p = per.get(id) ?? { bands: { easy: 0, medium: 0, hard: 0 }, types: new Map() };
      p.bands[band]++;
      p.types.set(q.type, (p.types.get(q.type) ?? 0) + 1);
      per.set(id, p);
    }
  }
  const out: TargetHealth[] = [];
  for (const t of targets) {
    const p = per.get(t.id);
    if (!p) continue;
    const status = {
      easy: bandStatus(p.bands.easy, "easy"),
      medium: bandStatus(p.bands.medium, "medium"),
      hard: bandStatus(p.bands.hard, "hard"),
    };
    out.push({
      ...t,
      total: p.bands.easy + p.bands.medium + p.bands.hard,
      bands: p.bands,
      status,
      worst: worstStatus(Object.values(status)),
      types: [...p.types]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    });
  }
  return {
    targets: out,
    usable,
    notAutoGraded,
    untagged,
    worst: out.length ? worstStatus(out.map((t) => t.worst)) : "short",
  };
}

/** The card's one line: "45 easy · 30 medium · 25 hard" over every target (each question once). */
export function bandSummary(h: BankHealth): string | null {
  if (h.targets.length === 0) return null;
  if (h.targets.length === 1) {
    const b = h.targets[0].bands;
    return `${b.easy} easy · ${b.medium} medium · ${b.hard} hard`;
  }
  return `${h.targets.length} targets · ${h.usable} questions`;
}

/** What a flag says: the targets and bands that are short or thin, worst first. */
export function healthFlags(h: BankHealth): { status: "short" | "thin"; text: string }[] {
  if (h.targets.length === 0)
    return [
      {
        status: "short",
        text: "No auto-graded questions tagged to a learning target, so practice checks can't use this bank",
      },
    ];
  const flags: { status: "short" | "thin"; text: string }[] = [];
  for (const s of ["short", "thin"] as const)
    for (const t of h.targets) {
      const bands = BANDS.filter((b) => t.status[b] === s);
      if (bands.length)
        flags.push({
          status: s,
          text: `${t.code}: ${bands.map((b) => `${t.bands[b]} ${b}`).join(", ")}${s === "short" ? " (can't fill a deal)" : " (thin)"}`,
        });
    }
  return flags;
}
