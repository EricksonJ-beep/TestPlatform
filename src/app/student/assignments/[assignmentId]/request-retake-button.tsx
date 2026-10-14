"use client";

import { Hand } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { requestRetake } from "../../actions";
import { useAskAnnouncer } from "../../ask-announcer";

/**
 * Ask the teacher for the next attempt: on a "Retakes need my OK" assignment, or "Ask to retake"
 * on a closed test (Jon, Oct 14 2026, R4).
 */
export function RequestRetakeButton({
  assignmentId,
  attemptNumber,
  label,
  primary = false,
  title,
  block = false,
}: {
  assignmentId: string;
  attemptNumber: number;
  /** Replaces "Request attempt N". */
  label?: string;
  primary?: boolean;
  /** The test's name, for the button's aria-label where the same button repeats down a list. */
  title?: string;
  /** Full width and 44px tall below `sm` (the student home's to-do rows). */
  block?: boolean;
}) {
  // The action revalidates every page this button is on: no second render (`useAction`).
  const { run, pending, error } = useAction({ refresh: false });
  const announce = useAskAnnouncer();
  const text = label ?? `Request attempt ${attemptNumber}`;
  const shown = pending ? "Sending…" : text;
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-2",
        block && "w-full flex-col items-stretch sm:w-auto sm:flex-row sm:items-center"
      )}
    >
      <Button
        size={block ? "lg" : "sm"}
        variant={primary ? "default" : "outline"}
        className={cn(block && "h-11 w-full sm:h-9 sm:w-auto")}
        disabled={pending}
        aria-label={title ? `${shown}: ${title}` : undefined}
        onClick={() =>
          run(requestRetake(assignmentId), () =>
            announce?.("Sent. You'll find it under Waiting on your teacher.")
          )
        }
      >
        <Hand data-icon="inline-start" aria-hidden />
        {shown}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-error-foreground">
          {error}
        </span>
      ) : null}
    </span>
  );
}
