"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, Hand, PauseCircle, Play } from "lucide-react";
import { PAUSE_REASON_TEXT, type PauseReason } from "@/lib/pause";
import type { PausedView } from "@/lib/queries/attempts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, useAction } from "@/components/use-action";
import { askToFinish, resumeWithCode } from "../../actions";

function minutesLeft(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  return `${m} ${m === 1 ? "minute" : "minutes"}`;
}

/**
 * A paused test (Finish later, Jon, Oct 13 2026): no questions, just how far
 * the student got, the resume-code box, and a way to ask the teacher to let
 * them finish. The test is finished in the teacher's room.
 */
export function PausedScreen({ view }: { view: PausedView }) {
  const router = useRouter();
  const { run, pending, error, fieldErrors } = useAction();
  const [asked, setAsked] = useState(!!view.askedAt);
  const reason = (view.reason ?? "student") as PauseReason;

  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col gap-4"
      data-paused-attempt={view.attemptId}
    >
      <Link
        href={`/student/assignments/${view.assignmentId}`}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Back
      </Link>
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card px-5 py-5">
        <div className="flex items-start gap-3">
          <PauseCircle className="mt-0.5 size-6 shrink-0 text-brand-deep" aria-hidden />
          <div>
            <h1 className="text-xl">{view.title} is paused</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {PAUSE_REASON_TEXT[reason] ?? ""} You finish it in {view.teacherName}&apos;s room.
            </p>
          </div>
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          <li className="tabular">
            <strong>
              {view.answered} of {view.total}
            </strong>{" "}
            questions answered. Those answers are saved and locked.
          </li>
          {view.remainingMs !== null ? (
            <li>
              The clock is stopped with <strong>{minutesLeft(view.remainingMs)}</strong> left.
            </li>
          ) : null}
        </ul>

        <form
          className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const code = String(new FormData(e.currentTarget).get("code") ?? "");
            run(resumeWithCode(view.attemptId, code), () => router.refresh());
          }}
        >
          <Label htmlFor="resume-code">Resume code from your teacher</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="resume-code"
              name="code"
              autoComplete="off"
              autoCapitalize="characters"
              className="h-11 max-w-48 font-mono text-lg tracking-widest uppercase"
              placeholder="ABC123"
              required
            />
            <Button type="submit" size="lg" disabled={pending}>
              <Play data-icon="inline-start" aria-hidden />
              Continue
            </Button>
          </div>
          <FieldError errors={fieldErrors} name="code" />
          {error && !fieldErrors.code?.length ? (
            <p className="text-sm text-error-foreground">{error}</p>
          ) : null}
        </form>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {asked ? (
            <span className="rounded-md bg-brand-soft px-2 py-1 text-brand-deep" data-asked>
              Asked {view.teacherName} to let you finish. Once they do, refresh this page.
            </span>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => run(askToFinish(view.attemptId), () => setAsked(true))}
            >
              <Hand data-icon="inline-start" aria-hidden />
              Ask my teacher to let me finish
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => router.refresh()}>
            Refresh
          </Button>
        </div>
      </section>
    </div>
  );
}
