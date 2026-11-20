/**
 * The home pages' shared control styles (BLOOM_HOME_REDESIGN.md §1): 44px buttons with a 10px
 * radius, 999px chips, and the segmented control (36px segments inside a 44px track). Class names
 * only, so server and client parts can both use them.
 */
export const btn = {
  base: "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[10px] px-4 text-[15px] font-semibold whitespace-nowrap disabled:opacity-60",
  /** Violet primary on light. */
  primary: "bg-stain text-white hover:bg-stain-deep",
  outline: "border border-line-strong bg-surface text-ink hover:bg-stain-wash",
  dark: "bg-ink text-white hover:bg-ink-raised",
  /** The primary action inside the dark panel. */
  eosin: "bg-eosin text-ink hover:bg-eosin-pale",
  /** A second action inside the dark panel. */
  onDark: "border border-white/40 text-white hover:bg-white/10",
  white: "bg-white text-ink hover:bg-stain-wash",
} as const;

export const chip = {
  base: "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold",
  neutral: "bg-segment text-ink",
  violet: "bg-stain-tint text-stain-deep",
  owed: "bg-owed text-owed-text",
  missing: "bg-eosin-tint text-eosin-text",
} as const;

export const segmented = {
  track:
    "inline-flex h-11 max-w-full items-center gap-1 overflow-x-auto rounded-full bg-segment p-1",
  segment: "h-9 shrink-0 rounded-full px-4 text-[15px] font-semibold whitespace-nowrap",
  on: "bg-white text-ink",
  off: "text-ink-soft hover:text-ink",
} as const;

/** A white card: 1px `line` border, no shadow. */
export const card = "rounded-[24px] border border-line bg-surface";
