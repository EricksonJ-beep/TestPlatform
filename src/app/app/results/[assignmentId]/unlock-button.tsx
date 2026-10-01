"use client";

import { Hand, LockOpen } from "lucide-react";
import { LocalTime } from "@/components/local-time";
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
  requestedAt = null,
}: {
  assignmentId: string;
  studentId: string;
  /** The attempt number an unlock would open. */
  nextAttempt: number;
  /** The teacher already unlocked `nextAttempt`. */
  unlocked: boolean;
  /** When the student asked for `nextAttempt`; null when they haven't. */
  requestedAt?: Date | null;
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
      ) : requestedAt ? (
        <>
          <span className="inline-flex items-center gap-1 text-xs text-warning-foreground">
            <Hand className="size-3.5" aria-hidden />
            Asked for attempt {nextAttempt} <LocalTime date={requestedAt} />
          </span>
          <Button
            size="sm"
            variant="default"
            disabled={pending}
            onClick={() => run(unlockNextAttempt(assignmentId, studentId))}
          >
            {pending ? "Approving…" : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(revokeAttemptUnlock(assignmentId, studentId))}
          >
            Decline
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
