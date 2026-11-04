"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { checkOffRelearning } from "../../../actions";

/**
 * Relearning revamp A5: check off a student's relearning on a target (nothing built for it yet,
 * or done another way). On a quiz this finishes its whole stitched activity.
 */
export function CheckOffRelearningButton({
  assignmentId,
  studentId,
  targetId,
  code,
}: {
  assignmentId: string;
  studentId: string;
  targetId: string;
  code: string;
}) {
  const { run, pending, error } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(checkOffRelearning(assignmentId, studentId, targetId))}
        aria-label={`Check off relearning on ${code}`}
        data-check-off={code}
      >
        <Check data-icon="inline-start" aria-hidden />
        {pending ? "Checking off…" : "Check off"}
      </Button>
      {error ? <span className="text-xs text-error-foreground">{error}</span> : null}
    </span>
  );
}
