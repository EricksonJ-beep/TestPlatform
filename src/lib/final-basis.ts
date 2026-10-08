import type { FinalBasis } from "@/db/schema";

/** Teacher-facing words for how a counting score came about (results table, CSV export). */
export const BASIS_LABEL: Record<FinalBasis, string> = {
  best_attempt: "best attempt",
  corrections_to_threshold: "corrections (capped)",
  corrections_to_full: "corrections",
  retake: "retake",
  per_target: "best per target",
};
