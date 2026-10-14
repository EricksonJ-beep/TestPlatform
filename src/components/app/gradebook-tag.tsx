"use client";

import { Check } from "lucide-react";
import { cn } from "cn";
import { tagLabel, type CellTag, type CellTone } from "@/lib/class-gradebook";

/**
 * The gradebook's colour families (research notes C, "Gradebook cells"): coral = your move,
 * brand = testing or paused, warning = the student owes it, a coral outline = your OK (optional),
 * muted = quiet, success = done.
 */
export const TONE_CLASS: Record<CellTone, string> = {
  coral: "bg-coral-soft text-coral-deep",
  brand: "bg-brand-soft text-brand-deep",
  warning: "bg-warning-soft text-warning-foreground",
  coral_outline: "border border-coral/60 bg-transparent text-coral-deep",
  muted: "bg-muted text-muted-foreground",
  success: "bg-success-soft text-success-foreground",
};

/**
 * The status tag as a pill; Missing is bold with an outline, Done carries a check. A narrow
 * grid column cuts long tags short, so the full words are the pill's title.
 */
export function TagPill({ tag, className }: { tag: CellTag; className?: string }) {
  const label = tagLabel(tag);
  return (
    <span
      title={label}
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-xs font-medium",
        TONE_CLASS[tag.tone],
        tag.kind === "missing" && "font-semibold ring-1 ring-warning ring-inset",
        className
      )}
      data-tag={tag.kind}
    >
      {tag.kind === "done" ? <Check className="size-3 shrink-0" aria-hidden /> : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
