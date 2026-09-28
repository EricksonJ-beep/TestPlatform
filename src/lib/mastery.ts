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
