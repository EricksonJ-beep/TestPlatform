"use client";

import { Check, X } from "lucide-react";
import { cn } from "cn";
import type { RetakeStatus } from "@/lib/queries/retakes";
import { useAction } from "@/components/use-action";
import { setRetakeOptIn } from "./actions";

/**
 * PLAN.md §5 "Must retake / Optional" as a table (Jon, Sept 29 2026): one
 * learning target per row in course order, its status in the middle, the
 * percent on the right. Required targets are fixed; optional ones carry a
 * checkbox to opt in. With `checklist`, each selected row shows its three gates.
 */
export function RetakePicker({
  assignmentId,
  retake,
  checklist = false,
  compact = false,
}: {
  assignmentId: string;
  retake: RetakeStatus;
  checklist?: boolean;
  compact?: boolean;
}) {
  const { run, pending, error } = useAction();
  const selected = new Set(retake.plan.selected);
  const required = retake.targets.filter((t) => t.required);
  const showChecklist = checklist && retake.plan.selected.length > 0;

  return (
    <div className={cn("flex flex-col gap-1", compact ? "text-xs" : "text-sm")} data-retake-picker>
      <table className="w-full" aria-label="Retake by learning target">
        <thead className="sr-only">
          <tr>
            <th scope="col">Learning target</th>
            <th scope="col">Status</th>
            {showChecklist ? <th scope="col">Relearning</th> : null}
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {retake.targets.map((t) => {
            const optional = !t.required && retake.optionalRetakes;
            const inScope = selected.has(t.id);
            return (
              <tr
                key={t.id}
                className={cn(
                  "border-b border-border last:border-0",
                  t.required ? "text-[#B93E27]" : "text-foreground"
                )}
                data-retake-target={t.code}
                data-required={t.required}
              >
                <td className={cn("pr-3 align-top", compact ? "py-1" : "py-1.5")}>
                  <span className="font-medium">{t.code}</span>
                  <span className={cn("text-muted-foreground", compact ? "hidden sm:inline" : "")}>
                    {" "}
                    · {t.title}
                  </span>
                </td>
                <td className={cn("pr-3 align-top whitespace-nowrap", compact ? "py-1" : "py-1.5")}>
                  {t.required ? (
                    <span className="rounded-md bg-coral-soft px-1.5 py-0.5 text-xs font-medium">
                      Must retake
                    </span>
                  ) : optional ? (
                    <label
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs",
                        t.optedIn
                          ? "border-brand bg-brand-soft text-brand-deep"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-3.5 accent-[var(--brand)]"
                        checked={t.optedIn}
                        disabled={pending}
                        onChange={(e) => run(setRetakeOptIn(assignmentId, t.id, e.target.checked))}
                        aria-label={`Retake ${t.code}`}
                        data-opt-in={t.code}
                      />
                      {t.optedIn ? "Retaking" : "Optional"}
                    </label>
                  ) : (
                    <span className="text-xs text-muted-foreground">Proficient</span>
                  )}
                </td>
                {showChecklist ? (
                  <td
                    className={cn("pr-3 align-top", compact ? "py-1" : "py-1.5")}
                    data-gate={t.code}
                  >
                    {inScope ? (
                      <span className="flex flex-wrap items-center gap-x-2 text-foreground tabular">
                        <Gate label="corrections" ok={t.gate.correctionsOk} />
                        <Gate label="activity" ok={t.gate.activityOk} />
                        <Gate label="practice" ok={t.gate.practiceOk} />
                        <span
                          className={cn(
                            "font-medium",
                            t.gate.unlocked ? "text-success-foreground" : "text-muted-foreground"
                          )}
                        >
                          {t.gate.unlocked ? "unlocked" : "locked"}
                        </span>
                      </span>
                    ) : null}
                  </td>
                ) : null}
                <td
                  className={cn(
                    "text-right align-top font-semibold tabular",
                    compact ? "py-1" : "py-1.5"
                  )}
                >
                  {Math.round(t.percent)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {required.length === 0 ? (
        <p className="text-muted-foreground">Every target is proficient. Nothing is required.</p>
      ) : null}
      {error ? <p className="text-xs text-error-foreground">{error}</p> : null}
    </div>
  );
}

function Gate({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5",
        ok ? "text-success-foreground" : "text-muted-foreground"
      )}
    >
      {label}
      {ok ? (
        <Check className="size-3.5" aria-label="done" />
      ) : (
        <X className="size-3.5" aria-label="not yet" />
      )}
    </span>
  );
}
