"use client";

import { Hand, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { letContinue } from "../actions";

/**
 * Finish later (Jon, Oct 13 2026): reopen one student's paused test without a
 * code. Shows when the student asked to be let back in.
 */
export function LetContinueButton({ attemptId, asked }: { attemptId: string; asked: boolean }) {
  const { run, pending, error } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-let-continue={attemptId}>
      {asked ? (
        <span className="inline-flex items-center gap-1 text-xs text-warning-foreground">
          <Hand className="size-3.5" aria-hidden />
          Asked to finish
        </span>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(letContinue(attemptId))}
      >
        <Play data-icon="inline-start" aria-hidden />
        Let them continue
      </Button>
      {error ? <span className="text-xs text-error-foreground">{error}</span> : null}
    </span>
  );
}
