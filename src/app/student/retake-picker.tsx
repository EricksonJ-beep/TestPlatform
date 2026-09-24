"use client";

import { Check, X } from "lucide-react";
import { cn } from "cn";
import type { RetakeStatus } from "@/lib/queries/retakes";
import { TargetChip } from "@/components/targets/target-chip";
import { useAction } from "@/components/use-action";
import { setRetakeOptIn } from "./actions";

/**
 * PLAN.md §5: "Must retake: LT4 · 70%" plus "Optional: LT2 · 80%, LT3 · 90%"
 * with checkboxes. Required targets are fixed; optional ones toggle an opt-in.
 * With `checklist`, each selected target shows its three gates.
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
  const required = retake.targets.filter((t) => t.required);
  const optional = retake.optionalRetakes ? retake.targets.filter((t) => !t.required) : [];
  const selected = new Set(retake.plan.selected);
  return (
    <div className={cn("flex flex-col gap-2", compact ? "text-xs" : "text-sm")} data-retake-picker>
      {required.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-[#B93E27]">Must retake:</span>
          {required.map((t) => (
            <TargetChip
              key={t.id}
              code={t.code}
              title={t.title}
              percent={t.percent}
              tone="required"
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">Every target is proficient. Nothing is required.</p>
      )}
      {optional.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-muted-foreground">Optional:</span>
          {optional.map((t) => (
            <label
              key={t.id}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-1.5 py-0.5",
                t.optedIn ? "border-brand bg-brand-soft" : "border-border"
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
              <TargetChip code={t.code} title={t.title} percent={t.percent} tone="optional" />
            </label>
          ))}
        </div>
      ) : null}
      {checklist && retake.plan.selected.length ? (
        <ul className="mt-1 flex flex-col gap-1" aria-label="Relearning checklist">
          {retake.targets
            .filter((t) => selected.has(t.id))
            .map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-x-2 tabular"
                data-gate={t.code}
              >
                <span className="font-medium">{t.code}:</span>
                <Gate label="corrections" ok={t.gate.correctionsOk} />
                <span aria-hidden>·</span>
                <Gate label="activity" ok={t.gate.activityOk} />
                <span aria-hidden>·</span>
                <Gate label="practice" ok={t.gate.practiceOk} />
                <span
                  className={cn(
                    "ml-1 font-medium",
                    t.gate.unlocked ? "text-success-foreground" : "text-muted-foreground"
                  )}
                >
                  {t.gate.unlocked ? "retake unlocked" : "locked"}
                </span>
              </li>
            ))}
        </ul>
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
