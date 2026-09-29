import Link from "next/link";
import { cn } from "cn";
import { PROGRESS_LABEL, PROGRESS_ORDER, type CorrectionsProgressState } from "@/lib/corrections";
import type { CorrectionsProgress } from "@/lib/queries/corrections";

const TONE: Record<CorrectionsProgressState, { bar: string; pill: string }> = {
  approved: { bar: "bg-success", pill: "bg-success-soft text-success-foreground" },
  submitted: { bar: "bg-brand", pill: "bg-brand-soft text-brand-deep" },
  returned: { bar: "bg-warning", pill: "bg-warning-soft text-warning-foreground" },
  in_progress: { bar: "bg-warning/60", pill: "bg-warning-soft text-warning-foreground" },
  not_started: { bar: "bg-coral", pill: "bg-coral-soft text-[#B93E27]" },
  none: { bar: "bg-muted-foreground/30", pill: "bg-muted text-muted-foreground" },
  no_attempt: { bar: "bg-muted", pill: "bg-muted text-muted-foreground" },
};

/**
 * Corrections across the class on this assignment (formative or summative):
 * a segmented bar of who is where, then one row per student with how far
 * along their set is and a link to review it.
 */
export function CorrectionsProgressSection({
  progress,
  reviewMode,
}: {
  progress: CorrectionsProgress;
  reviewMode: "auto" | "teacher_approved";
}) {
  const { rows, totals } = progress;
  const withWork = rows.filter((r) => r.state !== "no_attempt" && r.state !== "none");
  const total = rows.length;
  if (total === 0) return null;
  const finished = totals.approved + (reviewMode === "auto" ? totals.submitted : 0);
  const needing = withWork.length;

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="corrections-heading"
      data-corrections-progress
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="corrections-heading" className="text-lg">
          Corrections
        </h2>
        <p className="text-sm text-muted-foreground tabular">
          {needing === 0
            ? "Nobody needs corrections yet."
            : `${finished} of ${needing} ${needing === 1 ? "student" : "students"} finished · ${totals.submitted} awaiting approval · ${totals.returned} returned · ${totals.in_progress} in progress · ${totals.not_started} not started`}
        </p>
        {totals.submitted > 0 ? (
          <Link
            href="/app/results/corrections"
            className="text-sm font-medium text-brand-deep hover:underline"
          >
            Approve {totals.submitted} →
          </Link>
        ) : null}
      </div>

      {needing > 0 ? (
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          {PROGRESS_ORDER.filter((s) => s !== "none" && s !== "no_attempt").map((s) =>
            totals[s] > 0 ? (
              <div
                key={s}
                className={TONE[s].bar}
                style={{ width: `${(totals[s] / needing) * 100}%` }}
                title={`${PROGRESS_LABEL[s]}: ${totals[s]}`}
              />
            ) : null
          )}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm" data-corrections-table>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="px-3 py-2 font-medium">
                Student
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Status
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Progress
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Review
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tone = TONE[r.state];
              const quiet = r.state === "no_attempt" || r.state === "none";
              return (
                <tr
                  key={r.studentId}
                  className={cn(
                    "border-b border-border last:border-0",
                    quiet && "text-muted-foreground"
                  )}
                  data-student={r.studentId}
                  data-corrections-state={r.state}
                >
                  <th scope="row" className="px-3 py-1.5 text-left font-medium whitespace-nowrap">
                    {r.lastName}, {r.firstName}
                  </th>
                  <td className="px-3 py-1.5">
                    <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", tone.pill)}>
                      {PROGRESS_LABEL[r.state]}
                    </span>
                    {r.state === "returned" && r.reviewerNote ? (
                      <span className="ml-2 text-xs text-muted-foreground">“{r.reviewerNote}”</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5">
                    {quiet ? (
                      <span className="text-xs">—</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-28 overflow-hidden rounded-full bg-muted"
                          aria-hidden
                        >
                          <span
                            className={cn(
                              "block h-full",
                              r.approved === r.needed ? "bg-success" : "bg-brand"
                            )}
                            style={{
                              width: `${r.needed ? (Math.max(r.done, r.started) / r.needed) * 100 : 0}%`,
                            }}
                          />
                        </span>
                        <span className="text-xs tabular">
                          {r.approved === r.needed
                            ? `${r.approved} of ${r.needed} approved`
                            : r.done > 0
                              ? `${r.done} of ${r.needed} submitted${r.approved ? ` · ${r.approved} approved` : ""}${r.returned ? ` · ${r.returned} returned` : ""}`
                              : `${r.started} of ${r.needed} started`}
                          {r.attemptNumber && r.attemptNumber > 1
                            ? ` · attempt ${r.attemptNumber}`
                            : ""}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {r.attemptId && !quiet ? (
                      <Link
                        href={`/app/results/attempts/${r.attemptId}`}
                        className="text-xs font-medium text-brand-deep hover:underline"
                      >
                        {r.state === "submitted" ? "Approve" : "Review"}
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
