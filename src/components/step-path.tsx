import { Check, Clock, Lock } from "lucide-react";
import { cn } from "cn";
import type { PathLine, PathStep } from "@/lib/step-path";

/**
 * The step path (relearning revamp "Student view", R5): connected circles, subway-map style.
 * Done: green check. Waiting: amber clock with what it waits for. Current: teal, larger, with a
 * pulsing ring. Locked: gray with a lock and its one-line reason. A vertical list on a phone, a row
 * from `sm` up. `mini` is the card and to-do version: small dots and the current step's name.
 */
export function StepPathLines({
  lines,
  footer,
  mini = false,
}: {
  lines: PathLine[];
  footer?: string | null;
  mini?: boolean;
}) {
  if (mini) return <MiniPath lines={lines} />;
  return (
    <div className="flex flex-col gap-4" data-step-path>
      {lines.map((line) => (
        <div key={line.key} className="flex flex-col gap-2" data-path-line={line.code ?? line.key}>
          {line.code || line.title ? (
            <p className="text-sm font-medium">
              {line.code}
              {line.code && line.title ? (
                <span className="font-normal text-muted-foreground"> · {line.title}</span>
              ) : (
                line.title
              )}
            </p>
          ) : null}
          <ol className="flex flex-col sm:flex-row sm:items-start">
            {line.steps.map((step, i) => (
              <StepItem
                key={`${step.kind}:${i}`}
                step={step}
                first={i === 0}
                last={i === line.steps.length - 1}
                prevDone={i > 0 && line.steps[i - 1].state === "done"}
              />
            ))}
          </ol>
        </div>
      ))}
      {footer ? (
        <p className="text-sm text-muted-foreground" data-path-footer>
          {footer}
        </p>
      ) : null}
    </div>
  );
}

const DOT: Record<PathStep["state"], string> = {
  done: "border-success bg-success text-white",
  waiting: "border-warning bg-warning-soft text-warning-foreground",
  current: "border-brand bg-brand text-white",
  locked: "border-border bg-muted text-muted-foreground",
};

function StepItem({
  step,
  first,
  last,
  prevDone,
}: {
  step: PathStep;
  first: boolean;
  last: boolean;
  prevDone: boolean;
}) {
  const current = step.state === "current";
  return (
    <li
      className="relative flex min-w-0 gap-3 pb-4 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-1.5 sm:pb-0 sm:text-center"
      data-step={step.kind}
      data-step-state={step.state}
      aria-current={current ? "step" : undefined}
    >
      {/* Connector: down the left on a phone, across the top from `sm`. */}
      {!last ? (
        <span
          aria-hidden
          className={cn(
            "absolute top-8 bottom-0 left-[15px] w-0.5 sm:top-[15px] sm:right-[-50%] sm:bottom-auto sm:left-1/2 sm:h-0.5 sm:w-auto",
            step.state === "done" ? "bg-success" : "bg-border"
          )}
        />
      ) : null}
      {!first ? (
        <span
          aria-hidden
          className={cn(
            "absolute hidden sm:top-[15px] sm:right-1/2 sm:left-0 sm:block sm:h-0.5",
            prevDone ? "bg-success" : "bg-border"
          )}
        />
      ) : null}
      <span className="relative z-10 flex size-8 shrink-0 items-center justify-center">
        {current ? (
          <span
            aria-hidden
            className="absolute inset-0 animate-ping rounded-full bg-brand/30 motion-reduce:animate-none"
          />
        ) : null}
        <span
          className={cn(
            "relative flex items-center justify-center rounded-full border-2",
            current ? "size-8" : "size-7",
            DOT[step.state]
          )}
        >
          {step.state === "done" ? (
            <Check className="size-4" strokeWidth={3} aria-label="done" />
          ) : step.state === "waiting" ? (
            <Clock className="size-3.5" aria-label="waiting" />
          ) : step.state === "locked" ? (
            <Lock className="size-3.5" aria-label="locked" />
          ) : (
            <span className="size-2.5 rounded-full bg-white" aria-label="you are here" />
          )}
        </span>
      </span>
      <span className="flex min-w-0 flex-col pt-1 sm:px-1 sm:pt-0">
        <span
          className={cn(
            "text-sm leading-tight",
            current
              ? "font-semibold text-brand-deep"
              : step.state === "locked"
                ? "text-muted-foreground"
                : "font-medium"
          )}
        >
          {step.label}
        </span>
        {step.note ? (
          <span className="text-xs leading-snug text-muted-foreground">{step.note}</span>
        ) : null}
      </span>
    </li>
  );
}

/** Small dots and the step the student is on ("Relearn", "Practice check"…). */
function MiniPath({ lines }: { lines: PathLine[] }) {
  const steps = lines.flatMap((l) => l.steps);
  const here =
    steps.find((s) => s.state === "current") ?? steps.find((s) => s.state === "waiting") ?? null;
  const label = lines
    .map((l) => l.steps.map((s) => `${s.label}: ${s.state}`).join(", "))
    .join("; ");
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" data-step-path-mini>
      {lines.map((line) => (
        <span
          key={line.key}
          className="inline-flex items-center gap-1"
          role="img"
          aria-label={`${line.code ? `${line.code}: ` : ""}${label}`}
        >
          {line.code && lines.length > 1 ? (
            <span className="mr-0.5 text-xs text-muted-foreground">{line.code}</span>
          ) : null}
          {line.steps.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {i > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "h-0.5 w-2.5 rounded",
                    line.steps[i - 1].state === "done" ? "bg-success" : "bg-border"
                  )}
                />
              ) : null}
              <span
                aria-hidden
                title={s.label}
                className={cn(
                  "inline-block rounded-full border",
                  s.state === "current" ? "size-3 ring-2 ring-brand/30" : "size-2.5",
                  DOT[s.state]
                )}
              />
            </span>
          ))}
        </span>
      ))}
      {here ? (
        <span className="text-xs font-medium text-brand-deep" data-step-path-here>
          {here.label}
          {here.state === "waiting" ? " · waiting for your teacher" : ""}
        </span>
      ) : null}
    </span>
  );
}
