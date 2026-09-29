"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { regradeAssignment } from "../actions";

/** Re-run auto grading on every finished attempt (after a grader or answer-key fix). Two clicks. */
export function RegradeButton({
  assignmentId,
  attempts,
}: {
  assignmentId: string;
  attempts: number;
}) {
  const { run, pending, error } = useAction();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  if (attempts === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {confirm ? (
        <>
          <Button
            variant="default"
            disabled={pending}
            onClick={() =>
              run(regradeAssignment(assignmentId), (r) => {
                setDone(r.regraded);
                setConfirm(false);
              })
            }
          >
            {pending
              ? "Regrading…"
              : `Yes, regrade ${attempts} ${attempts === 1 ? "attempt" : "attempts"}`}
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(false)} disabled={pending}>
            Cancel
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          onClick={() => setConfirm(true)}
          title="Re-run auto grading with the current answer keys. Manual scores are kept."
        >
          <RefreshCw data-icon="inline-start" aria-hidden />
          {done !== null ? `Regraded ${done}` : "Regrade"}
        </Button>
      )}
      {error ? <span className="text-xs text-error-foreground">{error}</span> : null}
    </span>
  );
}
