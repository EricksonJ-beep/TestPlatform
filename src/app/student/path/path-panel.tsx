import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
import type { StepPathView } from "@/lib/step-path";
import { StepPathLines } from "@/components/step-path";
import { Button } from "@/components/ui/button";
import { StartCheckButton } from "../checks/start-check-button";
import { KeepScoreButton } from "./keep-score-button";
import { OptionalTargets } from "./optional-targets";

/**
 * The assessment page's step path (relearning revamp "Student view", R5): the lines of steps, then
 * one Next step box with one button (first on a phone), a quiz's end choice (Keep my 80% / Take
 * the retake) and its optional 80%+ targets. `retakeControl` is the page's own start or ask
 * control, so the retake starts exactly as it always has.
 */
export function PathPanel({
  assignmentId,
  view,
  retakeControl,
  relearningStarted,
  showOptional,
}: {
  assignmentId: string;
  view: StepPathView;
  retakeControl: React.ReactNode;
  relearningStarted: boolean;
  showOptional: boolean;
}) {
  const next = view.next;
  const action =
    !next || next.action.kind === "none" ? null : next.action.kind === "corrections" ||
      next.action.kind === "relearn" ? (
      <Button
        size="lg"
        className="w-full sm:w-auto"
        nativeButton={false}
        render={<Link href={next.action.href} />}
      >
        {next.action.label}
      </Button>
    ) : next.action.kind === "check" ? (
      <StartCheckButton
        assignmentId={assignmentId}
        kind={next.action.checkKind}
        bundleId={next.action.bundleId}
      />
    ) : (
      retakeControl
    );
  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      aria-label="Your path"
      data-path-panel
    >
      <div className="flex flex-col gap-4">
        <div className="order-2 sm:order-1">
          <StepPathLines lines={view.lines} footer={view.footer} />
        </div>
        <div
          className="order-1 flex flex-col gap-3 rounded-lg border border-brand/40 bg-brand-soft/50 p-4 sm:order-2"
          data-next-step-box
        >
          {next ? (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold tracking-wide text-brand-deep uppercase">
                  Next step
                </p>
                <p className="text-base font-medium" data-next-headline>
                  {next.headline}
                </p>
                {next.minutes ? (
                  <p className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="size-4" aria-hidden /> About {next.minutes} minutes
                  </p>
                ) : null}
              </div>
              {view.endChoice ? (
                <div className="grid gap-3 sm:grid-cols-2" data-end-choice>
                  <KeepScoreButton assignmentId={assignmentId} percent={view.endChoice.percent} />
                  {/* Two equal big choices (decision 28). */}
                  <div className="[&_button]:h-12 [&_button]:w-full">{retakeControl}</div>
                </div>
              ) : action ? (
                <div>{action}</div>
              ) : null}
            </>
          ) : (
            <p className="inline-flex items-center gap-2 text-base font-medium" data-path-done>
              <CheckCircle2 className="size-5 text-success-foreground" aria-hidden />
              You&apos;re all done with this one.
            </p>
          )}
        </div>
      </div>
      {showOptional && view.optional.length ? (
        <OptionalTargets
          assignmentId={assignmentId}
          targets={view.optional}
          relearningStarted={relearningStarted}
        />
      ) : null}
    </section>
  );
}
