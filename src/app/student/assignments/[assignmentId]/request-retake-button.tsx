"use client";

import { Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { requestRetake } from "../../actions";

/**
 * Ask the teacher for the next attempt: on a "Retakes need my OK" assignment, or "Ask to retake"
 * on a closed test (Jon, Oct 14 2026, R4).
 */
export function RequestRetakeButton({
  assignmentId,
  attemptNumber,
  label,
  primary = false,
}: {
  assignmentId: string;
  attemptNumber: number;
  /** Replaces "Request attempt N". */
  label?: string;
  primary?: boolean;
}) {
  const { run, pending, error } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant={primary ? "default" : "outline"}
        disabled={pending}
        onClick={() => run(requestRetake(assignmentId))}
      >
        <Hand data-icon="inline-start" aria-hidden />
        {pending ? "Sending…" : (label ?? `Request attempt ${attemptNumber}`)}
      </Button>
      {error ? <span className="text-xs text-error-foreground">{error}</span> : null}
    </span>
  );
}
