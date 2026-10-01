"use client";

import { LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { revokeAttemptUnlock, unlockNextAttempt } from "../actions";

/**
 * Per-student unlock for assignments with "Retakes need my OK" (Jon, Oct 1 2026).
 * Shows which attempt the click opens; once given, a quiet "take back".
 */
export function UnlockButton({
  assignmentId,
  studentId,
  nextAttempt,
  unlocked,
}: {
  assignmentId: string;
  studentId: string;
  /** The attempt number an unlock would open. */
  nextAttempt: number;
  /** The teacher already unlocked `nextAttempt`. */
  unlocked: boolean;
}) {
  const { run, pending, error } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-unlock={nextAttempt}>
      {unlocked ? (
        <>
          <span className="inline-flex items-center gap-1 text-xs text-success-foreground">
            <LockOpen className="size-3.5" aria-hidden />
            Attempt {nextAttempt} unlocked
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(revokeAttemptUnlock(assignmentId, studentId))}
          >
            Take back
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(unlockNextAttempt(assignmentId, studentId))}
        >
          <LockOpen data-icon="inline-start" aria-hidden />
          {pending ? "Unlocking…" : `Unlock attempt ${nextAttempt}`}
        </Button>
      )}
      {error ? <span className="text-xs text-error-foreground">{error}</span> : null}
    </span>
  );
}
