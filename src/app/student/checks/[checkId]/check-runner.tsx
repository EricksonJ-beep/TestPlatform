"use client";

import { safe } from "@/lib/safe-action";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, RotateCcw, X } from "lucide-react";
import { cn } from "cn";
import type { Answer } from "@/lib/grading";
import type { PracticeFeedback } from "@/lib/practice";
import type { CheckRunnerPayload } from "@/lib/queries/practice-checks";
import { QuestionMedia } from "@/components/questions/question-media";
import { RichText } from "@/components/rich-text";
import { StimulusPanel } from "@/components/stimulus/stimulus-panel";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { AnswerInput, isAnswered } from "../../attempt/[attemptId]/answer-input";
import { answerPracticeCheck, nextPracticeCheckRound } from "../actions";

type Answered = { answer: Answer; feedback: PracticeFeedback };

/**
 * The practice check screen (PLAN.md §5 screen 9; docs/relearning-revamp-plan.md P2–P3): "Question
 * k of 5", one answer each, then right or wrong with the explanation. Below the pass mark, Look back
 * lists the misses with their answers and why, then "Try a new 5"; at it, the check is passed and
 * the path moves on.
 */
export function CheckRunner({ payload }: { payload: CheckRunnerPayload }) {
  const router = useRouter();
  const { check, assignment, round, questions, targets } = payload;
  const total = questions.length;
  const [answered, setAnswered] = useState<Record<string, Answered>>(payload.answered);
  const [draft, setDraft] = useState<Record<string, Answer>>({});
  const firstOpen = questions.findIndex((q) => !payload.answered[q.id]);
  const [idx, setIdx] = useState(firstOpen === -1 ? Math.max(0, total - 1) : firstOpen);
  const [status, setStatus] = useState(round);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assignmentHref = `/student/assignments/${assignment.id}`;
  const codes = targets.map((t) => t.code).join(", ");

  useEffect(() => {
    if (payload.fontScale === 100) return;
    const root = document.documentElement;
    const prev = root.style.fontSize;
    root.style.fontSize = `${payload.fontScale}%`;
    return () => {
      root.style.fontSize = prev;
    };
  }, [payload.fontScale]);

  const q = questions[idx];
  const entry = q ? answered[q.id] : undefined;
  const current: Answer = entry ? entry.answer : (draft[q?.id ?? ""] ?? null);
  const answeredCount = Object.keys(answered).length;
  const finished = !!status?.finished;

  async function submit() {
    if (!q || entry || !status) return;
    setBusy(true);
    setError(null);
    const r = await safe(answerPracticeCheck(status.id, q.id, current));
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setAnswered((prev) => ({ ...prev, [q.id]: { answer: current, feedback: r.data.feedback } }));
    setStatus((s) =>
      s
        ? {
            ...s,
            finished: r.data.round.finished,
            score: r.data.round.score,
            passed: r.data.round.passed,
          }
        : s
    );
    if (r.data.round.finished) router.refresh();
  }

  async function tryAgain() {
    setBusy(true);
    setError(null);
    const r = await safe(nextPracticeCheckRound(check.id));
    if (!r.ok) {
      setBusy(false);
      setError(r.error);
      return;
    }
    // A fresh page load deals the new round's questions into the screen.
    window.location.reload();
  }

  const missed = questions.filter(
    (x) => answered[x.id] && answered[x.id].feedback.isCorrect !== true
  );
  const showResult = finished && (idx >= total - 1 || answeredCount === total) && !!entry;

  return (
    <div
      className="-mx-4 -my-6 flex min-h-[calc(100vh-3.5rem)] flex-col md:-mx-6"
      data-practice-check={check.id}
    >
      <header className="sticky top-14 z-10 flex h-11 items-center gap-3 border-b border-border bg-card px-4 text-sm md:px-6">
        <Link
          href={assignmentHref}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          aria-label="Back to the assignment"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <span className="truncate font-medium">Practice check · {codes}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {check.passMark} of {total || 5} to pass
        </span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular" data-progress>
          {answeredCount} of {total}
        </span>
      </header>
      <div className="h-1.5 w-full bg-muted" aria-hidden>
        <div
          className="h-full bg-brand transition-[width]"
          style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }}
        />
      </div>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-5 md:px-6">
        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-error-soft px-4 py-2 text-sm text-error-foreground"
          >
            {error}
          </p>
        ) : null}

        {check.passed || (showResult && status?.passed) ? (
          <section
            className="flex flex-col gap-3 rounded-lg border border-success/40 bg-success-soft/40 px-5 py-5"
            data-check-result="passed"
          >
            <h2 className="text-xl">
              {status?.score ?? check.passMark} of {total}. You passed!
            </h2>
            <p className="text-sm">
              {assignment.type === "formative" &&
              check.purpose === "path" &&
              payload.finalPercent !== null
                ? `Your score on ${assignment.title} is now ${Math.round(payload.finalPercent)}%. Head back to see what's next.`
                : check.purpose === "attempt"
                  ? `You can start attempt ${check.unlocksAttemptNumber ?? ""} now.`
                  : "Your practice check is done. Head back to see what's next."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" nativeButton={false} render={<Link href={assignmentHref} />}>
                Back to {assignment.title}
              </Button>
            </div>
          </section>
        ) : showResult ? (
          <section
            className="flex flex-col gap-4 rounded-lg border border-border bg-card px-5 py-5"
            data-check-result="look-back"
          >
            <div>
              <h2 className="text-xl">
                {status?.score ?? 0} of {total}. You need {check.passMark}.
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Look back at what you missed, then try a new set of {total}.
              </p>
            </div>
            <ol className="flex flex-col gap-3">
              {missed.map((x) => (
                <li key={x.id} className="rounded-lg border border-border px-4 py-3 text-sm">
                  <RichText text={x.stem} as="p" className="font-medium" />
                  <CheckFeedback fb={answered[x.id].feedback} />
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={() => void tryAgain()} disabled={busy} data-try-again>
                <RotateCcw data-icon="inline-start" aria-hidden />
                {busy ? "Dealing…" : `Try a new ${total}`}
              </Button>
              <Button
                size="lg"
                variant="outline"
                nativeButton={false}
                render={<Link href={assignmentHref} />}
              >
                Reopen my relearning
              </Button>
            </div>
          </section>
        ) : q ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="tabular">
                Question {idx + 1} of {total}
              </span>
              {q.target ? <TargetChip code={q.target.code} title={q.target.title} /> : null}
              <span>· Your first answer counts</span>
            </div>
            {q.stimulus ? <StimulusPanel stimulus={q.stimulus} pinned /> : null}
            <article className="rounded-lg border border-border bg-card px-5 py-4">
              <RichText text={q.stem} as="p" className="text-[15px] leading-relaxed" />
              <QuestionMedia mediaUrl={q.mediaUrl} mediaAlt={q.mediaAlt} videoUrl={q.videoUrl} />
              <div
                className={cn("mt-4", entry && "pointer-events-none")}
                aria-disabled={!!entry}
                data-answered={!!entry}
              >
                <AnswerInput
                  key={q.id}
                  question={q}
                  answer={current}
                  onChange={(a) => setDraft((d) => ({ ...d, [q.id]: a }))}
                />
              </div>
              {entry ? <CheckFeedback fb={entry.feedback} /> : null}
            </article>
            <div className="flex flex-wrap items-center gap-2">
              <div className="ml-auto flex gap-2">
                {!entry ? (
                  <Button
                    type="button"
                    size="lg"
                    disabled={busy || !isAnswered(current)}
                    onClick={() => void submit()}
                    data-check
                  >
                    {busy ? "Checking…" : "Check answer"}
                  </Button>
                ) : idx < total - 1 ? (
                  <Button type="button" size="lg" onClick={() => setIdx((i) => i + 1)} data-next>
                    Next
                    <ChevronRight data-icon="inline-end" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            There are no questions in this check yet. Tell your teacher.
          </p>
        )}
      </main>
    </div>
  );
}

/** Right or wrong, with the correct answer and why (the first answer is the one that counts). */
function CheckFeedback({ fb }: { fb: PracticeFeedback }) {
  return (
    <section
      className={cn(
        "mt-3 flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm",
        fb.isCorrect ? "border-success/40 bg-success-soft/50" : "border-coral/40 bg-coral-soft/40"
      )}
      aria-live="polite"
      data-feedback={fb.isCorrect ? "correct" : "incorrect"}
    >
      <p className="flex items-center gap-2 font-medium">
        {fb.isCorrect ? (
          <>
            <Check className="size-4 text-success-foreground" aria-hidden /> Correct
          </>
        ) : (
          <>
            <X className="size-4 text-[#B93E27]" aria-hidden /> Not quite
          </>
        )}
      </p>
      {!fb.isCorrect && fb.correctAnswer ? (
        <p>
          <span className="text-muted-foreground">Correct answer: </span>
          <RichText text={fb.correctAnswer} />
        </p>
      ) : null}
      {fb.optionFeedback.map((t, i) => (
        <p key={i}>
          <RichText text={t} />
        </p>
      ))}
      {fb.explanation ? (
        <p>
          <span className="text-muted-foreground">Why: </span>
          <RichText text={fb.explanation} />
        </p>
      ) : null}
    </section>
  );
}
