"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Eye, Lightbulb, X } from "lucide-react";
import { cn } from "cn";
import type { Answer } from "@/lib/grading";
import type { PracticeFeedback } from "@/lib/practice";
import { HINT_AFTER_MISSES, type PracticeProgress } from "@/lib/practice-rules";
import type { PracticeRunnerPayload } from "@/lib/queries/practice";
import { RichText } from "@/components/rich-text";
import { StimulusPanel } from "@/components/stimulus/stimulus-panel";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { AnswerInput, isAnswered } from "../../attempt/[attemptId]/answer-input";
import { answerPractice, revealPractice, startPractice } from "../actions";

type Answered = { answer: Answer; feedback: PracticeFeedback };

/**
 * The practice screen (PLAN.md §3.7): the calm test layout, but each answer is
 * checked on the spot, Apps Script style (Jon, Oct 13 2026): a miss means try
 * again, the hint shows after three misses, and Show answer reveals the key
 * and explanation any time. Unlimited attempts of the set.
 */
export function PracticeRunner({ payload }: { payload: PracticeRunnerPayload }) {
  const router = useRouter();
  const { attempt, set, questions } = payload;
  const total = questions.length;
  const [answered, setAnswered] = useState<Record<string, Answered>>(payload.answered);
  const [progress, setProgress] = useState<PracticeProgress>(payload.progress);
  const [draft, setDraft] = useState<Record<string, Answer>>({});
  const firstOpen = questions.findIndex((q) => !answered[q.id]?.feedback.closed);
  const [idx, setIdx] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [summary, setSummary] = useState(!!attempt.completedAt || progress.complete);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

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
  const done = entry?.feedback.closed ? entry : undefined;
  const current: Answer = done ? done.answer : (draft[q?.id ?? ""] ?? entry?.answer ?? null);
  // The same wrong answer twice is not a new try.
  const unchanged = !!entry && JSON.stringify(entry.answer) === JSON.stringify(current);

  async function send(kind: "check" | "reveal") {
    if (!q || done) return;
    setChecking(true);
    setError(null);
    const r =
      kind === "check"
        ? await answerPractice(attempt.id, q.id, current)
        : await revealPractice(attempt.id, q.id);
    setChecking(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setAnswered((prev) => ({
      ...prev,
      [q.id]: {
        answer: kind === "check" ? current : (prev[q.id]?.answer ?? null),
        feedback: r.data.feedback,
      },
    }));
    setProgress(r.data.progress);
    if (r.data.completed) router.refresh();
  }

  async function again() {
    setRestarting(true);
    const r = await startPractice(set.id);
    if (r.ok) router.push(`/student/practice/${r.data.attemptId}`);
    else {
      setRestarting(false);
      setError(r.error);
    }
  }

  return (
    <div
      className="-mx-4 -my-6 flex min-h-[calc(100vh-3.5rem)] flex-col md:-mx-6"
      data-practice-attempt={attempt.id}
    >
      <header className="sticky top-14 z-10 flex h-11 items-center gap-3 border-b border-border bg-card px-4 text-sm md:px-6">
        <Link
          href="/student"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          aria-label="Back to home"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <span className="truncate font-medium">{set.title}</span>
        <span className="ml-auto text-xs text-muted-foreground">Practice · not graded</span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular" data-progress>
          {progress.answered} of {total}
        </span>
      </header>
      <div className="h-1.5 w-full bg-muted" aria-hidden>
        <div
          className="h-full bg-brand transition-[width]"
          style={{ width: `${total ? (progress.answered / total) * 100 : 0}%` }}
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

        {summary ? (
          <section
            className="flex flex-col gap-4 rounded-lg border border-border bg-card px-5 py-5"
            aria-labelledby="practice-summary"
            data-practice-summary
          >
            <h2 id="practice-summary" className="text-xl">
              {progress.complete ? "Practice complete" : "Your progress so far"}
            </h2>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-success-soft py-3">
                <dt className="text-xs text-success-foreground">Correct</dt>
                <dd className="text-2xl font-semibold text-success-foreground tabular">
                  {progress.correct}
                </dd>
              </div>
              <div className="rounded-lg bg-brand-soft py-3">
                <dt className="text-xs text-brand-deep">Done</dt>
                <dd className="text-2xl font-semibold text-brand-deep tabular">
                  {progress.answered} / {total}
                </dd>
              </div>
              <div className="rounded-lg bg-muted py-3">
                <dt className="text-xs text-muted-foreground">Score</dt>
                <dd className="text-2xl font-semibold tabular" data-percent>
                  {progress.percent === null ? "—" : `${Math.round(progress.percent)}%`}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">
              {progress.complete
                ? "This counts as a completed practice set. Try it again any time; your best score is what your teacher sees."
                : "Get every question right, or show its answer, to complete the set."}
            </p>
            <div className="flex flex-wrap gap-2">
              {progress.complete ? (
                <Button size="lg" onClick={() => void again()} disabled={restarting}>
                  {restarting ? "Opening…" : "Practice again"}
                </Button>
              ) : (
                <Button size="lg" onClick={() => setSummary(false)}>
                  Keep going
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  setSummary(false);
                  setIdx(0);
                }}
              >
                Review answers
              </Button>
              <Button
                size="lg"
                variant="ghost"
                nativeButton={false}
                render={<Link href="/student" />}
              >
                Home
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
            </div>
            {q.stimulus ? <StimulusPanel stimulus={q.stimulus} pinned /> : null}
            <article className="rounded-lg border border-border bg-card px-5 py-4">
              <RichText text={q.stem} as="p" className="text-[15px] leading-relaxed" />
              {q.mediaUrl ? (
                <div className="mt-3 rounded-lg bg-brand-soft p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={q.mediaUrl}
                    alt=""
                    className="max-h-96 max-w-full rounded-md bg-white"
                  />
                </div>
              ) : null}
              {q.videoUrl ? (
                <div className="mt-3 rounded-lg bg-brand-soft p-3">
                  {/youtube\.com|youtu\.be/.test(q.videoUrl) ? (
                    <a
                      href={q.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-brand-deep hover:underline"
                    >
                      Watch the video
                    </a>
                  ) : (
                    <video
                      src={q.videoUrl}
                      controls
                      className="w-full max-w-xl rounded-md bg-black"
                    />
                  )}
                </div>
              ) : null}
              <div
                className={cn("mt-4", done && "pointer-events-none")}
                aria-disabled={!!done}
                data-answered={!!done}
              >
                <AnswerInput
                  key={q.id}
                  question={q}
                  answer={current}
                  onChange={(a) => setDraft((d) => ({ ...d, [q.id]: a }))}
                />
              </div>
              {entry ? <Feedback fb={entry.feedback} /> : null}
            </article>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={idx === 0}
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft data-icon="inline-start" aria-hidden />
                Previous
              </Button>
              <div className="ml-auto flex gap-2">
                {!done ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      disabled={checking}
                      onClick={() => void send("reveal")}
                      data-reveal
                    >
                      <Eye data-icon="inline-start" aria-hidden />
                      Show answer
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      disabled={checking || !isAnswered(current) || unchanged}
                      onClick={() => void send("check")}
                      data-check
                    >
                      {checking ? "Checking…" : entry ? "Check again" : "Check answer"}
                    </Button>
                  </>
                ) : idx < total - 1 ? (
                  <Button type="button" size="lg" onClick={() => setIdx((i) => i + 1)} data-next>
                    Next
                    <ChevronRight data-icon="inline-end" aria-hidden />
                  </Button>
                ) : (
                  <Button type="button" size="lg" onClick={() => setSummary(true)} data-finish>
                    {progress.complete ? "See your score" : "Progress"}
                  </Button>
                )}
              </div>
            </div>

            <nav
              aria-label="Question navigator"
              className="rounded-lg border border-border bg-card p-3"
            >
              <ol className="flex flex-wrap gap-1.5">
                {questions.map((x, i) => {
                  const touched = answered[x.id];
                  const a = touched?.feedback.closed ? touched : undefined;
                  const trying = !!touched && !a;
                  return (
                    <li key={x.id}>
                      <button
                        type="button"
                        aria-label={`Question ${i + 1}${a ? (a.feedback.revealed ? ", answer shown" : a.feedback.isCorrect ? ", correct" : a.feedback.isCorrect === false ? ", incorrect" : ", answered") : trying ? ", still trying" : ""}`}
                        aria-current={i === idx ? "step" : undefined}
                        onClick={() => setIdx(i)}
                        className={cn(
                          "size-9 rounded-md border text-sm font-medium tabular transition-colors",
                          i === idx ? "border-brand ring-2 ring-brand/40" : "border-border",
                          a
                            ? a.feedback.isCorrect
                              ? "bg-success-soft text-success-foreground"
                              : a.feedback.isCorrect === false
                                ? "bg-coral-soft text-[#B93E27]"
                                : "bg-brand-soft text-brand-deep"
                            : trying
                              ? "bg-warning-soft text-warning-foreground"
                              : "bg-card text-muted-foreground"
                        )}
                      >
                        {i + 1}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">This practice set has no questions.</p>
        )}
      </main>
    </div>
  );
}

function Feedback({ fb }: { fb: PracticeFeedback }) {
  if (!fb.closed) return <TryAgain fb={fb} />;
  const tone =
    fb.isCorrect === true
      ? "border-success/40 bg-success-soft/50"
      : fb.isCorrect === false
        ? "border-coral/40 bg-coral-soft/40"
        : "border-border bg-muted/40";
  return (
    <section
      className={cn("mt-4 flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm", tone)}
      aria-live="polite"
      data-feedback={
        fb.revealed
          ? "revealed"
          : fb.isCorrect === null
            ? "manual"
            : fb.isCorrect
              ? "correct"
              : "incorrect"
      }
    >
      <p className="flex items-center gap-2 font-medium">
        {fb.revealed ? (
          <>
            <Eye className="size-4 text-[#B93E27]" aria-hidden /> Here is the answer
          </>
        ) : fb.isCorrect === true ? (
          <>
            <Check className="size-4 text-success-foreground" aria-hidden /> Correct
            {fb.misses > 0 ? ` after ${fb.misses + 1} tries` : ""}
            {fb.pointsPossible > 1 ? ` · ${fb.pointsEarned} of ${fb.pointsPossible} points` : ""}
          </>
        ) : fb.isCorrect === false ? (
          <>
            <X className="size-4 text-[#B93E27]" aria-hidden /> Not quite
            {fb.pointsEarned ? ` · ${fb.pointsEarned} of ${fb.pointsPossible} points` : ""}
          </>
        ) : (
          "Saved. This kind of question is read by your teacher, not checked automatically."
        )}
      </p>
      {fb.isCorrect === false && fb.correctAnswer ? (
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
      {fb.note && fb.isCorrect === false && !fb.revealed ? (
        <p className="text-xs text-muted-foreground">{fb.note}</p>
      ) : null}
    </section>
  );
}

/** A miss on an open question: try again, with the hint once it unlocks. */
function TryAgain({ fb }: { fb: PracticeFeedback }) {
  const left = HINT_AFTER_MISSES - fb.misses;
  return (
    <section
      className="mt-4 flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/50 px-4 py-3 text-sm"
      aria-live="polite"
      data-feedback="try-again"
    >
      <p className="flex items-center gap-2 font-medium">
        <X className="size-4 text-warning-foreground" aria-hidden /> Not quite. Change your answer
        and check again.
        {fb.pointsEarned ? ` (${fb.pointsEarned} of ${fb.pointsPossible} points so far)` : ""}
      </p>
      {fb.note ? <p className="text-xs text-muted-foreground">{fb.note}</p> : null}
      {fb.hint ? (
        <p className="flex gap-2 rounded-md bg-card px-3 py-2" data-hint>
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden />
          <span>
            <span className="font-medium">Hint: </span>
            <RichText text={fb.hint} />
          </span>
        </p>
      ) : left > 0 ? (
        <p className="text-xs text-muted-foreground">
          {fb.misses} {fb.misses === 1 ? "try" : "tries"} so far. A hint shows after{" "}
          {HINT_AFTER_MISSES}, if your teacher wrote one.
        </p>
      ) : null}
    </section>
  );
}
