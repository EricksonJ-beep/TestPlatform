"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { cn } from "cn";
import type { NeededTarget } from "@/lib/queries/practice";
import type { RetakeStatus } from "@/lib/queries/retakes";
import { targetList } from "@/lib/quiz-practice";
import { retakeChoice, type RetakeChoice } from "@/lib/retakes";
import { useAction } from "@/components/use-action";
import { chooseRetakeScope, setRetakeOptIn } from "./actions";
import { ActivityCard, PracticeSetCard } from "./practice-cards";

/**
 * PLAN.md §5 "Must retake / Optional" as a table (Jon, Sept 29 2026): one
 * learning target per row in course order, its status in the middle, the
 * percent on the right. Required targets are fixed; optional ones carry a
 * checkbox to opt in. With `checklist`, each selected row shows its three gates.
 * With `steps` (Jon, Nov 9 2026) an open gate is the way to finish it: corrections open the
 * form, activity opens the target's activity (a list under the row when there are several), and
 * practice lists the target's practice sets.
 *
 * On the relearning path (`onPath`, relearning revamp S3, ticket R6) the full-size picker leads with
 * two choices, **Full test** (every target) or **Custom** (the required targets plus any the
 * student ticks), and the checklist shows the path's steps: corrections, relearning and the
 * practice check on a required target, corrections alone on an added one (decision 29).
 */
export function RetakePicker({
  assignmentId,
  retake,
  checklist = false,
  compact = false,
  onPath = false,
  steps = [],
}: {
  assignmentId: string;
  retake: RetakeStatus;
  checklist?: boolean;
  compact?: boolean;
  onPath?: boolean;
  steps?: NeededTarget[];
}) {
  const { run, pending, error } = useAction();
  const stepBy = new Map(steps.map((s) => [s.id, s]));
  // The row whose activities or practice sets are listed under it.
  const [open, setOpen] = useState<{ id: string; kind: "activity" | "practice" } | null>(null);
  const selected = new Set(retake.plan.selected);
  const required = retake.targets.filter((t) => t.required);
  const showChecklist = checklist && retake.plan.selected.length > 0;
  const choice =
    onPath && retake.optionalRetakes && retake.plan.blocker !== "no_attempts"
      ? retakeChoice(retake.plan)
      : null;
  // Full test has every target in, so its rows need no tick boxes (Custom brings them back).
  const boxes = !(choice === "full" && !compact);

  return (
    <div className={cn("flex flex-col gap-1", compact ? "text-xs" : "text-sm")} data-retake-picker>
      {choice && !compact ? (
        <RetakeChoices
          choice={choice}
          requiredCodes={required.map((t) => t.code)}
          threshold={retake.threshold}
          pending={pending}
          onChoose={(c) => run(chooseRetakeScope(assignmentId, c))}
        />
      ) : null}
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
            const step = showChecklist && inScope ? stepBy.get(t.id) : undefined;
            const acts = step && !t.gate.activityOk ? step.activities : [];
            const sets = step && !t.gate.practiceOk ? step.sets : [];
            const listed = open?.id === t.id ? open.kind : null;
            const toggle = (kind: "activity" | "practice") =>
              setOpen(listed === kind ? null : { id: t.id, kind });
            return (
              <Fragment key={t.id}>
                <tr
                  className={cn(
                    "border-b border-border last:border-0",
                    t.required ? "text-[#B93E27]" : "text-foreground"
                  )}
                  data-retake-target={t.code}
                  data-required={t.required}
                >
                  <td className={cn("pr-3 align-top", compact ? "py-1" : "py-1.5")}>
                    <span className="font-medium">{t.code}</span>
                    <span
                      className={cn("text-muted-foreground", compact ? "hidden sm:inline" : "")}
                    >
                      {" "}
                      · {t.title}
                    </span>
                  </td>
                  <td
                    className={cn("pr-3 align-top whitespace-nowrap", compact ? "py-1" : "py-1.5")}
                  >
                    {t.required ? (
                      <span className="rounded-md bg-coral-soft px-1.5 py-0.5 text-xs font-medium">
                        Must retake
                      </span>
                    ) : optional && !boxes ? (
                      <span
                        className="rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand-deep"
                        data-in-full-test={t.code}
                      >
                        In your retake
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
                          onChange={(e) =>
                            run(setRetakeOptIn(assignmentId, t.id, e.target.checked))
                          }
                          aria-label={`Retake ${t.code}`}
                          data-opt-in={t.code}
                        />
                        {onPath
                          ? t.optedIn
                            ? "Added"
                            : "Add"
                          : t.optedIn
                            ? "Retaking"
                            : "Optional"}
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
                          <Gate
                            label="corrections"
                            ok={t.gate.correctionsOk}
                            href={step?.correctionsHref}
                          />
                          {/* An added target on the path needs its corrections only (decision 29). */}
                          {onPath && !t.required ? null : (
                            <>
                              <Gate
                                label={onPath ? "relearning" : "activity"}
                                ok={t.gate.activityOk}
                                href={
                                  acts.length === 1 ? `/student/activities/${acts[0].id}` : null
                                }
                                expanded={acts.length > 1 ? listed === "activity" : undefined}
                                onToggle={() => toggle("activity")}
                              />
                              <Gate
                                label={onPath ? "practice check" : "practice"}
                                ok={t.gate.practiceOk}
                                expanded={sets.length ? listed === "practice" : undefined}
                                onToggle={() => toggle("practice")}
                              />
                            </>
                          )}
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
                {listed && (listed === "activity" ? acts.length > 1 : sets.length > 0) ? (
                  <tr className="border-b border-border last:border-0" data-gate-list={t.code}>
                    <td colSpan={4} className="pb-2">
                      <ul
                        className="flex flex-col gap-2"
                        aria-label={
                          listed === "activity"
                            ? `Activities for ${t.code}`
                            : `Practice for ${t.code}`
                        }
                      >
                        {listed === "activity"
                          ? acts.map((x) => <ActivityCard key={x.id} a={x} compact />)
                          : sets.map((x) => <PracticeSetCard key={x.id} s={x} compact />)}
                      </ul>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {required.length === 0 ? (
        <p className="text-muted-foreground">
          {choice
            ? "Every target is proficient. Nothing is required. Choose Full test, or tick the targets you want to retake."
            : "Every target is proficient. Nothing is required."}
        </p>
      ) : null}
      {error ? <p className="text-xs text-error-foreground">{error}</p> : null}
    </div>
  );
}

/** Full test or Custom (S3): two big choices, the current one pressed. */
function RetakeChoices({
  choice,
  requiredCodes,
  threshold,
  pending,
  onChoose,
}: {
  choice: RetakeChoice;
  requiredCodes: string[];
  threshold: number;
  pending: boolean;
  onChoose: (choice: RetakeChoice) => void;
}) {
  const options: { value: RetakeChoice; title: string; line: string }[] = [
    {
      value: "full",
      title: "Full test",
      line: "Every target on the test. Do corrections on every question you missed first.",
    },
    {
      value: "custom",
      title: "Custom",
      line: requiredCodes.length
        ? `${targetList(requiredCodes)}, plus any target at ${threshold}% or higher you tick. A target you add needs its corrections first.`
        : `Just the targets you tick. A target you add needs its corrections first.`,
    },
  ];
  return (
    <div
      className="mb-2 grid gap-2 sm:grid-cols-2"
      role="group"
      aria-label="Which retake?"
      data-retake-choice={choice}
    >
      {options.map((o) => {
        const on = choice === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={pending || on}
            onClick={() => onChoose(o.value)}
            className={cn(
              "flex min-h-11 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
              on
                ? "border-brand bg-brand-soft text-brand-deep"
                : "border-border bg-card hover:border-brand/60 hover:bg-muted/40",
              pending && !on ? "opacity-60" : ""
            )}
            data-choice={o.value}
          >
            <span className="inline-flex items-center gap-1.5 font-medium">
              {on ? <Check className="size-4" aria-hidden /> : null}
              {o.title}
            </span>
            <span className={cn("text-xs", on ? "text-brand-deep/80" : "text-muted-foreground")}>
              {o.line}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * One gate of the checklist. An open gate with somewhere to go is a link (`href`) or a button
 * that lists the choices under the row (`expanded` set); otherwise it is plain text.
 */
function Gate({
  label,
  ok,
  href,
  expanded,
  onToggle,
}: {
  label: string;
  ok: boolean;
  href?: string | null;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const body = (
    <>
      {label}
      {ok ? (
        <Check className="size-3.5" aria-label="done" />
      ) : (
        <X className="size-3.5" aria-label="not yet" />
      )}
    </>
  );
  const go =
    "inline-flex items-center gap-0.5 font-medium text-brand-deep underline underline-offset-2 hover:no-underline";
  if (!ok && href)
    return (
      <Link href={href} className={go} data-gate-link={label}>
        {body}
      </Link>
    );
  if (!ok && expanded !== undefined)
    return (
      <button
        type="button"
        className={go}
        aria-expanded={expanded}
        onClick={onToggle}
        data-gate-link={label}
      >
        {body}
      </button>
    );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5",
        ok ? "text-success-foreground" : "text-muted-foreground"
      )}
    >
      {body}
    </span>
  );
}
