"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { keepMyScore } from "../actions";

/** "Keep my 80%" (decision 28): done for now; the retake stays open until its window closes. */
export function KeepScoreButton({
  assignmentId,
  percent,
}: {
  assignmentId: string;
  percent: number;
}) {
  const { run, pending, error } = useAction();
  return (
    <span className="flex flex-col gap-1">
      <Button
        size="lg"
        variant="outline"
        className="h-12 w-full sm:w-auto"
        disabled={pending}
        onClick={() => run(keepMyScore(assignmentId))}
        data-keep-score
      >
        <Check data-icon="inline-start" aria-hidden />
        Keep my {percent}%
      </Button>
      {error ? <span className="text-xs text-error-foreground">{error}</span> : null}
    </span>
  );
}
