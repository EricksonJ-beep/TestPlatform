"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Flag, Maximize2 } from "lucide-react";
import { cn } from "cn";
import type { Answer } from "@/lib/grading";
import type { RunnerPayload } from "@/lib/queries/attempts";
import { RichText } from "@/components/rich-text";
import { StimulusPanel } from "@/components/stimulus/stimulus-panel";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { recordTabSwitch, saveAnswer, setFlag, submitAttempt } from "../../actions";
import { AnswerInput, isAnswered } from "./answer-input";

type SaveState = "idle" | "saving" | "saved" | "error";

function fmtRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/**
 * The test screen (PLAN.md §5 screen 3–4): one question at a time, autosave on
 * every answer, server-side deadline with autosubmit, flag for review, navigator
 * when backtracking is allowed, tab-switch count, submit review with confirmation.
 */
export function TestRunner({ payload }: { payload: RunnerPayload }) {
  const router = useRouter();
  const { attempt, assignment, questions } = payload;
  const total = questions.length;
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(payload.responses.map((r) => [r.questionId, r.answer]))
  );
  const [flags, setFlags] = useState<Set<string>>(
    () => new Set(payload.responses.filter((r) => r.flagged).map((r) => r.questionId))
  );
  const [idx, setIdx] = useState(0);
  const [review, setReview] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tabSwitches, setTabSwitches] = useState(attempt.tabSwitches);
  const [submitting, setSubmitting] = useState(false);
  const [timeUp, setTimeUp] = useState(false);

  // Server-anchored countdown: the browser clock is offset by the server's "now" at load (inside the effect).
  const dueAtMs = attempt.dueAt ? new Date(attempt.dueAt).getTime() : null;
  const serverNowMs = new Date(payload.serverNow).getTime();
  const [remaining, setRemaining] = useState<number | null>(dueAtMs ? dueAtMs - serverNowMs : null);

  const q = questions[idx];
  const answeredCount = questions.filter((x) => isAnswered(answers[x.id] ?? null)).length;
  const unanswered = questions.filter((x) => !isAnswered(answers[x.id] ?? null));

  // --- Submit (manual or automatic) -------------------------------------------------
  const submittedRef = useRef(false);
  const doSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    const r = await submitAttempt(attempt.id);
    if (r.ok || r.status === 409) router.push(`/student/assignments/${assignment.id}`);
    else {
      submittedRef.current = false;
      setSubmitting(false);
      setSaveError(r.error);
    }
  }, [attempt.id, assignment.id, router]);

  useEffect(() => {
    if (!dueAtMs) return;
    const deadline = dueAtMs + (Date.now() - serverNowMs);
    const tick = () => {
      const left = deadline - Date.now();
      setRemaining(left);
      if (left <= 0) {
        setTimeUp(true);
        void doSubmit();
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [dueAtMs, serverNowMs, doSubmit]);

  // --- Autosave ---------------------------------------------------------------------
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const persist = useCallback(
    (questionId: string, answer: Answer) => {
      setSaveState("saving");
      void saveAnswer(attempt.id, questionId, answer).then((r) => {
        if (r.ok) {
          setSaveState("saved");
          setSaveError(null);
        } else {
          setSaveState("error");
          setSaveError(r.error);
          if (r.status === 409 && /Time is up/.test(r.error)) {
            setTimeUp(true);
            void doSubmit();
          }
        }
      });
    },
    [attempt.id, doSubmit]
  );
  const onChange = (questionId: string, answer: Answer, debounce: boolean) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    clearTimeout(timers.current[questionId]);
    if (debounce) {
      setSaveState("saving");
      timers.current[questionId] = setTimeout(() => persist(questionId, answer), 500);
    } else persist(questionId, answer);
  };
  const toggleFlag = (questionId: string) => {
    const next = !flags.has(questionId);
    setFlags((prev) => {
      const s = new Set(prev);
      if (next) s.add(questionId);
      else s.delete(questionId);
      return s;
    });
    void setFlag(attempt.id, questionId, next);
  };

  // --- Integrity: tab switches, full screen, font scale ------------------------------
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        void recordTabSwitch(attempt.id).then((r) => {
          if (r.ok) setTabSwitches(r.data.tabSwitches);
        });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [attempt.id]);
  useEffect(() => {
    if (payload.fontScale === 100) return;
    const root = document.documentElement;
    const prev = root.style.fontSize;
    root.style.fontSize = `${payload.fontScale}%`;
    return () => {
      root.style.fontSize = prev;
    };
  }, [payload.fontScale]);
  const fullScreen = () => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const isText =
    q.type === "fill_blank" ||
    q.type === "short_answer" ||
    q.type === "extended_response" ||
    q.type === "numeric";
  const canGoBack = assignment.allowBacktrack && idx > 0;
  const lowTime = remaining !== null && remaining < 60_000;

  return (
    <div
      className="-mx-4 -my-6 flex min-h-[calc(100vh-3.5rem)] flex-col md:-mx-6"
      data-attempt={attempt.id}
    >
      {/* Thin header */}
      <header className="sticky top-14 z-10 flex h-11 items-center gap-3 border-b border-border bg-card px-4 text-sm md:px-6">
        <span className="truncate font-medium">{assignment.title}</span>
        <span
          className={cn(
            "ml-auto text-xs",
            saveState === "error" ? "text-error-foreground" : "text-muted-foreground"
          )}
          aria-live="polite"
          data-save-state={saveState}
        >
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Saved"
              : saveState === "error"
                ? "Not saved"
                : ""}
        </span>
        {remaining !== null ? (
          <span
            className={cn(
              "rounded-md px-2 py-0.5 font-mono text-sm tabular",
              lowTime ? "bg-coral-soft text-[#B93E27]" : "bg-muted"
            )}
            aria-label="Time remaining"
            data-timer
          >
            {fmtRemaining(remaining)}
          </span>
        ) : null}
        <button
          type="button"
          onClick={fullScreen}
          aria-label="Full screen"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
        >
          <Maximize2 className="size-4" aria-hidden />
        </button>
      </header>

      {/* Progress */}
      <div className="h-1.5 w-full bg-muted" aria-hidden>
        <div
          className="h-full bg-brand transition-[width]"
          style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }}
        />
      </div>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-5 md:px-6">
        {timeUp ? (
          <p
            role="alert"
            className="rounded-lg bg-coral-soft px-4 py-3 text-sm font-medium text-[#B93E27]"
          >
            Time is up. Submitting your answers…
          </p>
        ) : null}
        {saveError && !timeUp ? (
          <p
            role="alert"
            className="rounded-lg bg-error-soft px-4 py-2 text-sm text-error-foreground"
          >
            {saveError}
          </p>
        ) : null}

        {review ? (
          <ReviewScreen
            total={total}
            answered={answeredCount}
            flagged={flags.size}
            unanswered={unanswered.map((u) => ({ id: u.id, n: questions.indexOf(u) + 1 }))}
            confirm={confirm}
            submitting={submitting}
            onJump={(i) => {
              setReview(false);
              setConfirm(false);
              setIdx(i);
            }}
            onKeepWorking={() => {
              setReview(false);
              setConfirm(false);
            }}
            onConfirm={() => setConfirm(true)}
            onSubmit={() => void doSubmit()}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="tabular">
                Question {idx + 1} of {total}
              </span>
              {q.target ? <TargetChip code={q.target.code} title={q.target.title} /> : null}
              <span className="ml-auto tabular">
                {q.points} {q.points === 1 ? "point" : "points"}
              </span>
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
              <div className="mt-4">
                <AnswerInput
                  key={q.id}
                  question={q}
                  answer={answers[q.id] ?? null}
                  onChange={(a) => onChange(q.id, a, isText)}
                />
              </div>
            </article>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={flags.has(q.id) ? "secondary" : "ghost"}
                onClick={() => toggleFlag(q.id)}
                aria-pressed={flags.has(q.id)}
              >
                <Flag
                  data-icon="inline-start"
                  aria-hidden
                  className={flags.has(q.id) ? "fill-current" : undefined}
                />
                {flags.has(q.id) ? "Flagged" : "Flag for review"}
              </Button>
              <div className="ml-auto flex gap-2">
                {assignment.allowBacktrack ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={!canGoBack}
                    onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft data-icon="inline-start" aria-hidden />
                    Previous
                  </Button>
                ) : null}
                {idx < total - 1 ? (
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                  >
                    Next
                    <ChevronRight data-icon="inline-end" aria-hidden />
                  </Button>
                ) : (
                  <Button type="button" size="lg" onClick={() => setReview(true)}>
                    Review &amp; submit
                  </Button>
                )}
              </div>
            </div>

            {assignment.allowBacktrack ? (
              <nav
                aria-label="Question navigator"
                className="rounded-lg border border-border bg-card p-3"
              >
                <ol className="flex flex-wrap gap-1.5">
                  {questions.map((x, i) => {
                    const done = isAnswered(answers[x.id] ?? null);
                    const flagged = flags.has(x.id);
                    return (
                      <li key={x.id}>
                        <button
                          type="button"
                          aria-label={`Question ${i + 1}${done ? ", answered" : ""}${flagged ? ", flagged" : ""}`}
                          aria-current={i === idx ? "step" : undefined}
                          onClick={() => setIdx(i)}
                          className={cn(
                            "size-9 rounded-md border text-sm font-medium tabular transition-colors",
                            i === idx ? "border-brand ring-2 ring-brand/40" : "border-border",
                            flagged
                              ? "bg-warning-soft text-warning-foreground"
                              : done
                                ? "bg-brand-soft text-brand-deep"
                                : "bg-card text-muted-foreground"
                          )}
                        >
                          {i + 1}
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="tabular">{answeredCount} answered</span>
                  <span className="tabular">{flags.size} flagged</span>
                  <span className="tabular">{total - answeredCount} unanswered</span>
                  <button
                    type="button"
                    className="ml-auto font-medium text-brand-deep hover:underline"
                    onClick={() => setReview(true)}
                  >
                    Review &amp; submit
                  </button>
                </p>
              </nav>
            ) : null}
          </>
        )}
      </main>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border bg-card px-4 py-2 text-xs text-muted-foreground md:px-6">
        <span>Leaving this tab is recorded for {assignment.teacherName}.</span>
        <span className="ml-auto tabular" data-tab-switches>
          {tabSwitches} tab {tabSwitches === 1 ? "switch" : "switches"}
        </span>
      </footer>
    </div>
  );
}

function ReviewScreen({
  total,
  answered,
  flagged,
  unanswered,
  confirm,
  submitting,
  onJump,
  onKeepWorking,
  onConfirm,
  onSubmit,
}: {
  total: number;
  answered: number;
  flagged: number;
  unanswered: { id: string; n: number }[];
  confirm: boolean;
  submitting: boolean;
  onJump: (index: number) => void;
  onKeepWorking: () => void;
  onConfirm: () => void;
  onSubmit: () => void;
}) {
  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-border bg-card px-5 py-5"
      aria-labelledby="review-title"
    >
      <h2 id="review-title" className="text-xl">
        Ready to submit?
      </h2>
      <dl className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-brand-soft py-3">
          <dt className="text-xs text-brand-deep">Answered</dt>
          <dd className="text-2xl font-semibold text-brand-deep tabular" data-count="answered">
            {answered}
          </dd>
        </div>
        <div className="rounded-lg bg-warning-soft py-3">
          <dt className="text-xs text-warning-foreground">Flagged</dt>
          <dd
            className="text-2xl font-semibold text-warning-foreground tabular"
            data-count="flagged"
          >
            {flagged}
          </dd>
        </div>
        <div className={cn("rounded-lg py-3", unanswered.length ? "bg-coral-soft" : "bg-muted")}>
          <dt
            className={cn(
              "text-xs",
              unanswered.length ? "text-[#B93E27]" : "text-muted-foreground"
            )}
          >
            Unanswered
          </dt>
          <dd
            className={cn(
              "text-2xl font-semibold tabular",
              unanswered.length ? "text-[#B93E27]" : "text-muted-foreground"
            )}
            data-count="unanswered"
          >
            {unanswered.length}
          </dd>
        </div>
      </dl>
      {unanswered.length > 0 ? (
        <div
          role="alert"
          className="flex flex-wrap items-start gap-2 rounded-lg border border-coral/40 bg-coral-soft/40 px-4 py-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#B93E27]" aria-hidden />
          <div>
            <p className="font-medium">Blank answers count as wrong.</p>
            <p className="text-muted-foreground">
              Unanswered:{" "}
              {unanswered.map((u, i) => (
                <span key={u.id}>
                  {i > 0 ? ", " : ""}
                  <button
                    type="button"
                    className="font-medium text-brand-deep hover:underline"
                    onClick={() => onJump(u.n - 1)}
                  >
                    Question {u.n}
                  </button>
                </span>
              ))}
            </p>
          </div>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {total} {total === 1 ? "question" : "questions"} · once you submit, you can&apos;t change
        answers.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onKeepWorking}
          disabled={submitting}
        >
          Keep working
        </Button>
        {confirm ? (
          <Button type="button" size="lg" onClick={onSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Yes, submit my test"}
          </Button>
        ) : (
          <Button type="button" size="lg" onClick={onConfirm}>
            Submit test
          </Button>
        )}
      </div>
    </section>
  );
}
