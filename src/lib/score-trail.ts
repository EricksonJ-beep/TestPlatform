/**
 * The score trail (Jon, Nov 3–4 2026; docs/relearning-revamp-plan.md G1, ticket R7): "40 → 80
 * (path) → 95 (retake)", each step dated, so the teacher and the student see how a counting score
 * came about. Pure: `score_history` holds every change (`recomputeFinalScore` writes it), this turns
 * it into steps. The class gradebook, the results table and My results all read it.
 */
import type { FinalBasis } from "@/db/schema";

export type ScoreStep = {
  percent: number;
  /** What moved the score here, in the teacher's words. */
  label: string;
  at: Date;
};

const RAISE_LABEL: Partial<Record<FinalBasis, string>> = {
  relearning_path: "relearning path",
  corrections_to_90: "corrections",
  corrections_to_threshold: "corrections",
  corrections_to_full: "corrections",
};

/**
 * Rule: steps in time order, a run of the same percent kept once (its first date). The first step is
 * attempt 1; a later rise is named by how the score came about (the path, corrections, otherwise a
 * retake), and a drop is a regrade (the highest counts, so only a teacher's change lowers it).
 * With no history yet (a score from before R7 shipped), attempt 1 and the counting score now.
 */
export function scoreTrail(input: {
  history: { percent: number; basis: FinalBasis | null; at: Date }[];
  /** Used when there is no history: attempt 1, and the counting score now. */
  first?: { percent: number; at: Date } | null;
  now?: { percent: number; basis: FinalBasis | null; at: Date } | null;
}): ScoreStep[] {
  const rows = input.history.length
    ? [...input.history].sort((a, b) => a.at.getTime() - b.at.getTime())
    : [
        ...(input.first ? [{ ...input.first, basis: "best_attempt" as FinalBasis }] : []),
        ...(input.now ? [input.now] : []),
      ];
  const steps: ScoreStep[] = [];
  for (const r of rows) {
    const prev = steps.at(-1);
    if (prev && Math.abs(prev.percent - r.percent) < 0.005) continue;
    const label = !prev
      ? "attempt 1"
      : r.percent < prev.percent
        ? "regrade"
        : ((r.basis && RAISE_LABEL[r.basis]) ?? "retake");
    steps.push({ percent: r.percent, label, at: r.at });
  }
  return steps;
}

/** "40 → 80 → 95". */
export function trailText(steps: ScoreStep[]): string {
  return steps.map((s) => `${Math.round(s.percent)}`).join(" → ");
}

/** "40% attempt 1, Nov 3 · 80% relearning path, Nov 4 · 95% retake, Nov 6" (school time zone). */
export function trailDetail(steps: ScoreStep[]): string {
  // A trail can arrive as JSON (dates as text), so the date is read either way.
  const day = (d: Date | string) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "America/Chicago",
    });
  return steps.map((s) => `${Math.round(s.percent)}% ${s.label}, ${day(s.at)}`).join(" · ");
}
