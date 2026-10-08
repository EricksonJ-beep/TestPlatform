import Link from "next/link";
import { PROGRESS_LABEL, PROGRESS_ORDER, type CorrectionsProgressState } from "@/lib/corrections";
import type { CorrectionsProgress } from "@/lib/queries/corrections";

export const TONE: Record<CorrectionsProgressState, { bar: string; pill: string }> = {
  approved: { bar: "bg-success", pill: "bg-success-soft text-success-foreground" },
  submitted: { bar: "bg-brand", pill: "bg-brand-soft text-brand-deep" },
  returned: { bar: "bg-warning", pill: "bg-warning-soft text-warning-foreground" },
  in_progress: { bar: "bg-warning/60", pill: "bg-warning-soft text-warning-foreground" },
  not_started: { bar: "bg-coral", pill: "bg-coral-soft text-[#B93E27]" },
  none: { bar: "bg-muted-foreground/30", pill: "bg-muted text-muted-foreground" },
  no_attempt: { bar: "bg-muted", pill: "bg-muted text-muted-foreground" },
};

/** Students whose set exists: everyone but "no attempt" and "nothing to correct". */
function needing(progress: CorrectionsProgress) {
  return progress.rows.filter((r) => r.state !== "no_attempt" && r.state !== "none").length;
}

/**
 * The one-line corrections tally for the class (formative or summative), with
 * the link into the approval queue. Per-student status lives in the student
 * table (student-table.tsx) since Oct 8 2026.
 */
export function CorrectionsSummary({
  progress,
  reviewMode,
}: {
  progress: CorrectionsProgress;
  reviewMode: "auto" | "teacher_approved";
}) {
  const { totals } = progress;
  const n = needing(progress);
  const finished = totals.approved + (reviewMode === "auto" ? totals.submitted : 0);
  return (
    <>
      <p className="text-sm text-muted-foreground tabular" data-corrections-summary>
        {n === 0
          ? "Nobody needs corrections yet."
          : `Corrections: ${finished} of ${n} ${n === 1 ? "student" : "students"} finished · ${totals.submitted} awaiting approval · ${totals.returned} returned · ${totals.in_progress} in progress · ${totals.not_started} not started`}
      </p>
      {totals.submitted > 0 ? (
        <Link
          href="/app/results/corrections"
          className="text-sm font-medium text-brand-deep hover:underline"
        >
          Approve {totals.submitted} →
        </Link>
      ) : null}
    </>
  );
}

/** A segmented bar of who is where with their corrections; nothing when nobody has a set. */
export function CorrectionsBar({ progress }: { progress: CorrectionsProgress }) {
  const n = needing(progress);
  if (n === 0) return null;
  const { totals } = progress;
  return (
    <div
      className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
      aria-hidden
      data-corrections-progress
    >
      {PROGRESS_ORDER.filter((s) => s !== "none" && s !== "no_attempt").map((s) =>
        totals[s] > 0 ? (
          <div
            key={s}
            className={TONE[s].bar}
            style={{ width: `${(totals[s] / n) * 100}%` }}
            title={`${PROGRESS_LABEL[s]}: ${totals[s]}`}
          />
        ) : null
      )}
    </div>
  );
}
