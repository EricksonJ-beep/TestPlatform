"use client";

import { Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { requestRetake } from "../../actions";

/** On a "Retakes need my OK" assignment: ask the teacher to unlock the next attempt. */
export function RequestRetakeButton({
  assignmentId,
  attemptNumber,
}: {
  assignmentId: string;
  attemptNumber: number;
}) {
  const { run, pending, error } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(requestRetake(assignmentId))}
      >
        <Hand data-icon="inline-start" aria-hidden />
        {pending ? "Sending…" : `Request attempt ${attemptNumber}`}
      </Button>
      {error ? <span className="text-xs text-error-foreground">{error}</span> : null}
    </span>
  );
}
