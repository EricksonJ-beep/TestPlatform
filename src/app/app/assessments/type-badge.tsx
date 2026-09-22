/** Shared colour per assessment type (PLAN.md §2): practice is calm, formative is brand, summative is coral. */
export const TYPE_STYLE = {
  practice: "bg-muted text-muted-foreground",
  formative: "bg-brand-soft text-brand-deep",
  summative: "bg-coral-soft text-[#B93E27]",
} as const;

export const TYPE_HELP = {
  practice: "Unlimited attempts, results shown immediately, no corrections gate.",
  formative: "Three attempts by default; corrections before each retake.",
  summative: "One section per learning target; targeted retakes per target.",
} as const;
