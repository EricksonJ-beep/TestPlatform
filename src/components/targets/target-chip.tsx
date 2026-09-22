import { cn } from "cn";

/**
 * Learning-target chip. Teal by default; "required" (coral) and "optional" (gray)
 * are the retake states from PLAN.md §3.11. Used on questions, tests, cards, and the tier board.
 */
export function TargetChip({
  code,
  title,
  percent,
  tone = "default",
  className,
}: {
  code: string;
  title?: string;
  percent?: number | null;
  tone?: "default" | "required" | "optional";
  className?: string;
}) {
  const tones = {
    default: "bg-brand-soft text-brand-deep",
    required: "bg-coral-soft text-[#B93E27]",
    optional: "bg-muted text-muted-foreground",
  } as const;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className
      )}
    >
      <span>{code}</span>
      {title ? <span className="truncate font-normal opacity-80">· {title}</span> : null}
      {percent !== undefined && percent !== null ? (
        <span className="tabular">· {Math.round(percent)}%</span>
      ) : null}
    </span>
  );
}
