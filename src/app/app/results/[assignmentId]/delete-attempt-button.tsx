"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { deleteAttempt } from "../actions";

/**
 * Wipe one attempt (a student started the test again by accident). Two clicks:
 * the first turns the link into a "Yes, delete" / "Cancel" pair. Not undoable.
 */
export function DeleteAttemptButton({
  attemptId,
  number,
  inProgress,
  /** Where to go afterwards; unset = stay and refresh (the gradebook row just disappears). */
  afterHref,
  variant = "link",
}: {
  attemptId: string;
  number: number;
  inProgress: boolean;
  afterHref?: string;
  variant?: "link" | "button";
}) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [confirm, setConfirm] = useState(false);
  const label = inProgress ? "Delete this attempt" : "Delete";
  const onDelete = () =>
    run(deleteAttempt(attemptId), () => {
      setConfirm(false);
      if (afterHref) router.push(afterHref);
    });
  if (confirm) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1" data-delete-attempt>
        <Button size="sm" variant="destructive" disabled={pending} onClick={onDelete}>
          {pending ? "Deleting…" : `Yes, delete attempt ${number}`}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm(false)}>
          Cancel
        </Button>
        {error ? <span className="text-xs text-error-foreground">{error}</span> : null}
      </span>
    );
  }
  const title = inProgress
    ? "Remove this unfinished attempt so the student can start fresh. Their answers so far are discarded."
    : "Remove this attempt, its answers, and its corrections. Their counting score recomputes from what is left.";
  if (variant === "button") {
    return (
      <Button variant="outline" onClick={() => setConfirm(true)} title={title} data-delete-attempt>
        <Trash2 data-icon="inline-start" aria-hidden />
        Delete attempt
      </Button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      title={title}
      className="text-xs font-medium text-error-foreground hover:underline"
      data-delete-attempt
    >
      {label}
    </button>
  );
}
