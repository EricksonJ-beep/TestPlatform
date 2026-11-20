"use client";

import { Hand, Play } from "lucide-react";
import { cn } from "cn";
import { btn } from "@/components/home/ui";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { letContinue } from "../actions";

/**
 * Finish later (Jon, Oct 13 2026): reopen one student's paused test without a
 * code. Shows when the student asked to be let back in. `tone="panel"` is the teacher home's dark
 * live panel: a 44px pink button with ink text.
 */
export function LetContinueButton({
  attemptId,
  asked,
  tone = "default",
}: {
  attemptId: string;
  asked: boolean;
  tone?: "default" | "panel";
}) {
  const { run, pending, error } = useAction();
  const panel = tone === "panel";
  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-let-continue={attemptId}>
      {asked ? (
        <span
          className={cn(
            "inline-flex items-center gap-1",
            panel ? "text-[13px] text-eosin-pale" : "text-xs text-warning-foreground"
          )}
        >
          <Hand className="size-3.5" aria-hidden />
          Asked to finish
        </span>
      ) : null}
      {panel ? (
        <button
          type="button"
          className={cn(btn.base, btn.eosin)}
          disabled={pending}
          onClick={() => run(letContinue(attemptId))}
        >
          {pending ? "Letting them in…" : "Let them continue"}
        </button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(letContinue(attemptId))}
        >
          <Play data-icon="inline-start" aria-hidden />
          Let them continue
        </Button>
      )}
      {error ? (
        <span className={cn("text-xs", panel ? "text-eosin-pale" : "text-error-foreground")}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
