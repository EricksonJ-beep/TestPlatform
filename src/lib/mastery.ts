/**
 * Heat bands for the per-target mastery grid on the results page (Jon, Sept 28
 * 2026): 100% green · 80–99% light green · 60–79% yellow · below 60% red.
 * Pure so the page and the tests share one definition.
 */
export type HeatBand = "full" | "high" | "mid" | "low";

export function heatBand(percent: number): HeatBand {
  if (percent >= 100) return "full";
  if (percent >= 80) return "high";
  if (percent >= 60) return "mid";
  return "low";
}

export const HEAT_LABEL: Record<HeatBand, string> = {
  full: "100%",
  high: "80–99%",
  mid: "60–79%",
  low: "Below 60%",
};

/** Class correct rate at or below this fraction flags a question for review. */
export const HARD_QUESTION_MAX = 0.5;

export type ClassAverages = {
  /** Mean of the students who have a percent for the target; null when none do. */
  byTarget: Record<string, { average: number; students: number } | null>;
  overall: { average: number; students: number } | null;
};

/**
 * Class averages for the results page (Jon, Sept 29 2026): per target, the
 * mean of each student's best percent; overall, the mean of each student's
 * overall percent. Students without a score are left out, not counted as zero.
 */
export function classAverages(
  targetIds: string[],
  rows: { percents: Record<string, number | undefined>; overall: number | null }[]
): ClassAverages {
  const mean = (xs: number[]) =>
    xs.length
      ? {
          average: Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10,
          students: xs.length,
        }
      : null;
  const byTarget: ClassAverages["byTarget"] = {};
  for (const id of targetIds)
    byTarget[id] = mean(
      rows.map((r) => r.percents[id]).filter((p): p is number => typeof p === "number")
    );
  return {
    byTarget,
    overall: mean(rows.map((r) => r.overall).filter((p): p is number => typeof p === "number")),
  };
}
