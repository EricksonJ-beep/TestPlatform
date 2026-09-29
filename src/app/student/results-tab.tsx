import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { cn } from "cn";
import type { StudentResult } from "@/lib/queries/student-results";
import { EmptyState } from "@/components/empty-state";
import { LocalTime } from "@/components/local-time";
import { TargetChip } from "@/components/targets/target-chip";

const CORRECTIONS_LABEL = {
  needed: "Corrections needed",
  returned: "Corrections returned",
  submitted: "Corrections submitted",
  approved: "Corrections approved",
  none: null,
} as const;

/**
 * Student screen 6 (PLAN.md §5): per assignment, every attempt with the
 * highest in bold, per-target bars, corrections, and the growth from attempt
 * 1 to the best. Scores appear only once the teacher releases them.
 */
export function ResultsTab({ results }: { results: StudentResult[] }) {
  if (results.length === 0)
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          icon={BarChart3}
          title="No results yet"
          description="After you finish something, every attempt lands here. Your highest score always counts."
        />
      </div>
    );
  return (
    <ul className="flex flex-col gap-3" aria-label="My results">
      {results.map((r) => (
        <li
          key={r.assignmentId}
          className="rounded-lg border border-border bg-card p-4"
          data-result={r.assignmentId}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Link
              href={`/student/assignments/${r.assignmentId}`}
              className="text-base font-medium hover:underline"
            >
              {r.title}
            </Link>
            <span className="text-xs text-muted-foreground">
              {r.className} · {r.type}
            </span>
            <span className="ml-auto font-semibold tabular" data-best>
              {r.released && r.bestPercent !== null
                ? `Best ${Math.round(r.bestPercent)}%`
                : "Submitted"}
            </span>
          </div>
          {r.released && r.growth !== null ? (
            <p className="mt-1 text-xs text-muted-foreground tabular" data-growth>
              Attempt 1 → best: {r.growth >= 0 ? "+" : ""}
              {Math.round(r.growth)} points
            </p>
          ) : null}
          {r.released && r.targets.length ? (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2" aria-label="By learning target">
              {r.targets.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-xs">
                  <TargetChip code={t.code} title={t.title} className="h-5 w-24 shrink-0" />
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span
                      className={cn(
                        "block h-full",
                        t.percent >= 80 ? "bg-success" : t.percent >= 60 ? "bg-warning" : "bg-coral"
                      )}
                      style={{ width: `${Math.min(100, t.percent)}%` }}
                    />
                  </span>
                  <span className="w-10 text-right tabular">{Math.round(t.percent)}%</span>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-3 divide-y divide-border rounded-md border border-border text-sm">
            {r.attempts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 px-3 py-1.5">
                <span className={cn(a.id === r.bestAttemptId && "font-semibold")}>
                  Attempt {a.number}
                  {a.scopeCodes ? ` · retake ${a.scopeCodes.join(", ")}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {a.submittedAt ? <LocalTime date={a.submittedAt} /> : "in progress"}
                </span>
                <span
                  className={cn("ml-auto tabular", a.id === r.bestAttemptId && "font-semibold")}
                >
                  {a.submittedAt
                    ? r.released && a.percent !== null
                      ? `${Math.round(a.percent)}%${a.pending ? " so far" : ""}`
                      : "Submitted"
                    : ""}
                </span>
              </li>
            ))}
          </ul>
          {r.corrections && CORRECTIONS_LABEL[r.corrections.state] ? (
            <p className="mt-2 text-xs">
              <Link
                href={`/student/corrections/${r.corrections.attemptId}`}
                className="font-medium text-brand-deep hover:underline"
              >
                {CORRECTIONS_LABEL[r.corrections.state]}
                {r.corrections.state === "needed"
                  ? ` · ${r.corrections.done} of ${r.corrections.needed}`
                  : ""}
              </Link>
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
