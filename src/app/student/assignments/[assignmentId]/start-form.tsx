"use client";

import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, useAction } from "@/components/use-action";
import { startAttempt } from "../../actions";

export function StartForm({
  assignmentId,
  needsCode,
  resume,
  timeLimitMinutes,
}: {
  assignmentId: string;
  needsCode: boolean;
  resume: boolean;
  timeLimitMinutes: number | null;
}) {
  const router = useRouter();
  const { run, pending, error, fieldErrors } = useAction();
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const code = (new FormData(e.currentTarget).get("accessCode") as string | null) || null;
        run(startAttempt(assignmentId, code), ({ attemptId }) =>
          router.push(`/student/attempt/${attemptId}`)
        );
      }}
    >
      {resume ? (
        <p className="text-sm">You have an attempt in progress. Your answers are saved.</p>
      ) : (
        <p className="text-sm">
          {timeLimitMinutes
            ? `The clock starts when you press Start and runs for ${timeLimitMinutes} minutes, even if you leave.`
            : "Take your time. Every answer saves as you go."}
        </p>
      )}
      {needsCode && !resume ? (
        <div className="grid max-w-xs gap-1.5">
          <Label htmlFor="sf-code">Access code</Label>
          <Input
            id="sf-code"
            name="accessCode"
            autoComplete="off"
            autoCapitalize="characters"
            className="h-11 font-mono text-lg tracking-widest uppercase"
            placeholder="ABC123"
            required
          />
          <FieldError errors={fieldErrors} name="accessCode" />
        </div>
      ) : null}
      {error && !fieldErrors.accessCode?.length ? (
        <p className="text-sm text-error-foreground">{error}</p>
      ) : null}
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          <Play data-icon="inline-start" aria-hidden />
          {resume ? "Continue" : "Start"}
        </Button>
      </div>
    </form>
  );
}
