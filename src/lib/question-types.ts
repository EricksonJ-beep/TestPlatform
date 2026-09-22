import type { BloomLevel, QuestionType } from "@/db/types";

/** Question types the Appendix A importer and Phase 1 editor accept (image_hotspot is Phase 2). */
export const IMPORTABLE_TYPES = [
  "multiple_choice",
  "multiple_select",
  "true_false",
  "fill_blank",
  "short_answer",
  "extended_response",
  "numeric",
  "matching",
  "ordering",
] as const satisfies readonly QuestionType[];
export type ImportableType = (typeof IMPORTABLE_TYPES)[number];

export const TYPE_LABEL: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  multiple_select: "Multiple select",
  true_false: "True / False",
  fill_blank: "Fill in the blank",
  short_answer: "Short answer",
  extended_response: "Extended response",
  numeric: "Numeric",
  matching: "Matching",
  ordering: "Ordering",
  image_hotspot: "Image hotspot",
};

export const BLOOM_LEVELS = [
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
] as const satisfies readonly BloomLevel[];

export const BLOOM_LABEL: Record<BloomLevel, string> = {
  remember: "Remember",
  understand: "Understand",
  apply: "Apply",
  analyze: "Analyze",
  evaluate: "Evaluate",
  create: "Create",
};

export const OPTION_LETTERS = ["a", "b", "c", "d", "e", "f"] as const;
