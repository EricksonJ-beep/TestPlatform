"use client";

import { useState } from "react";
import { ShieldCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { clearToRetake, undoClearToRetake } from "../../../actions";

/**
 * Clear to retake (Jon, Nov 20 2026): the teacher clears a student's relearning and practice
 * check because they did the work together. One target (`targetId`), or every required target
 * still open. Asks first, since on a quiz it raises the score, and takes an optional note.
 */
export function ClearToRetakeButton({
  assignmentId,
  studentId,
  targetId,
  codes,
  raisesTo,
}: {
  assignmentId: string;
  studentId: string;
  /** Null: every required target still open. */
  targetId: string | null;
  /** The targets the clear covers, for the dialog. */
  codes: string[];
  /** A quiz whose path raises the score: the percent a cleared target is raised to. */
  raisesTo: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { run, pending, error, reset } = useAction();
  const what = codes.join(", ");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant={targetId ? "outline" : "default"}
            aria-label={targetId ? `Clear ${what} to retake` : "Clear to retake"}
            data-clear={targetId ? what : "all"}
          />
        }
      >
        <ShieldCheck data-icon="inline-start" aria-hidden />
        {targetId ? "Clear" : "Clear to retake"}
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(clearToRetake(assignmentId, studentId, targetId, note), () => {
              setOpen(false);
              setNote("");
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Clear {what} to retake?</DialogTitle>
            <DialogDescription>
              This marks the relearning and the practice check as done by you, so the student
              doesn&apos;t have to do them. Corrections are still theirs to finish.
              {raisesTo !== null
                ? ` On this quiz it also raises a target below ${raisesTo}% to ${raisesTo}%, once its corrections are approved.`
                : ""}{" "}
              You can undo it until they start their next attempt.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="clear-note">Note (optional)</Label>
            <Textarea
              id="clear-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Worked through it with me at lunch"
            />
          </div>
          {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Clearing…" : "Clear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Take a clear back, until the student starts an attempt on it. */
export function UndoClearButton({
  assignmentId,
  studentId,
  checkId,
  label,
}: {
  assignmentId: string;
  studentId: string;
  checkId: string;
  /** What the clear was on, for screen readers. */
  label: string;
}) {
  const { run, pending, error } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(undoClearToRetake(assignmentId, studentId, checkId))}
        aria-label={`Undo the clear on ${label}`}
        data-undo-clear={label}
      >
        <Undo2 data-icon="inline-start" aria-hidden />
        {pending ? "Undoing…" : "Undo"}
      </Button>
      {error ? <span className="text-xs text-error-foreground">{error}</span> : null}
    </span>
  );
}
