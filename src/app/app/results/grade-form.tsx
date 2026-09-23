"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, useAction } from "@/components/use-action";
import { clearManualScore, setManualScore } from "./actions";

/**
 * Points + note for one response. Used for manual grading (short answer,
 * extended response) and for overriding any auto score.
 */
export function GradeForm({
  attemptId,
  questionId,
  maxPoints,
  current,
  autoScore,
  onSaved,
  compact = false,
}: {
  attemptId: string;
  questionId: string;
  maxPoints: number;
  /** Existing manual grade or override, if any. */
  current: { points: number; note: string | null } | null;
  /** The auto score this would override (null for manual-only questions). */
  autoScore: number | null;
  onSaved?: () => void;
  compact?: boolean;
}) {
  const { run, pending, error, fieldErrors } = useAction();
  const [note, setNote] = useState(current?.note ?? "");
  const key = `${attemptId}-${questionId}`;
  return (
    <form
      className="flex flex-col gap-2"
      data-grade-form={questionId}
      onSubmit={(e) => {
        e.preventDefault();
        run(setManualScore(attemptId, questionId, new FormData(e.currentTarget)), () =>
          onSaved?.()
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`pts-${key}`}>Points (of {maxPoints})</Label>
          <Input
            id={`pts-${key}`}
            name="points"
            type="number"
            min={0}
            max={maxPoints}
            step={0.5}
            className="h-9 w-24"
            defaultValue={current?.points ?? ""}
            required
            autoFocus={!compact}
          />
        </div>
        <div className="grid min-w-48 flex-1 gap-1">
          <Label htmlFor={`note-${key}`}>
            Note {autoScore !== null ? "(why the override)" : "(optional)"}
          </Label>
          {compact ? (
            <Input
              id={`note-${key}`}
              name="note"
              className="h-9"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Feedback the student can read later"
            />
          ) : (
            <Textarea
              id={`note-${key}`}
              name="note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Feedback the student can read later"
            />
          )}
        </div>
        <Button type="submit" disabled={pending}>
          {current ? "Update grade" : "Save grade"}
        </Button>
        {current && autoScore !== null ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => run(clearManualScore(attemptId, questionId), () => onSaved?.())}
          >
            Use auto score ({autoScore})
          </Button>
        ) : null}
      </div>
      <FieldError errors={fieldErrors} name="points" />
      {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
    </form>
  );
}
