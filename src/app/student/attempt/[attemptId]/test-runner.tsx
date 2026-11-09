"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Flag,
  Lock,
  Maximize2,
  PauseCircle,
} from "lucide-react";
import { cn } from "cn";
import type { Answer } from "@/lib/grading";
import type { RunnerPayload } from "@/lib/queries/attempts";
import { createSaveQueue, type SaveQueue, type SaveQueueState } from "@/lib/save-queue";
import { RichText } from "@/components/rich-text";
import { StimulusPanel } from "@/components/stimulus/stimulus-panel";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import {
  attemptHeartbeat,
  finishLater,
  recordTabSwitch,
  saveAnswer,
  setFlag,
  submitAttempt,
} from "../../actions";
import { AnswerInput, isAnswered } from "./answer-input";

type SaveState = "idle" | "saving" | "saved" | "error";

const NO_CONNECTION =
  "Couldn't reach Bloom. Check your wifi and try again. Your answers are still on this screen.";

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

  // --- Autosave (H1.1, Nov 9 2026) ---------------------------------------------------
  // Every answer waits in a queue until the server confirms it. A save that doesn't arrive (a
  // wifi drop) is sent again, and Submit waits for the queue to empty, so an answer on the
  // screen is never graded as blank.
  const [unsaved, setUnsaved] = useState<SaveQueueState>({ pending: 0, failing: false });
  const [refused, setRefused] = useState(false);
  const onRefused = useRef<(r: { status: number; error: string }) => void>(() => undefined);
  const queueRef = useRef<SaveQueue<Answer> | null>(null);
  // Made on first use (an answer, a submit), never during render.
  const getQueue = useCallback(
    () =>
      (queueRef.current ??= createSaveQueue<Answer>({
        save: async (questionId, answer) => {
          const r = await saveAnswer(attempt.id, questionId, answer);
          if (r.ok) return "saved";
          if (r.status >= 500 || r.status === 429) return "retry";
          onRefused.current(r);
          return "fatal";
        },
        onChange: (s) => {
          setUnsaved(s);
          if (s.pending === 0) setSaveState("saved");
        },
      })),
    [attempt.id]
  );
  useEffect(() => {
    const back = () => queueRef.current?.retryNow();
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, []);
  // Typed answers wait 500 ms for the next keystroke before they're queued.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const typed = useRef<Record<string, Answer>>({});
  const flushTyping = useCallback(() => {
    for (const [questionId, t] of Object.entries(timers.current)) {
      clearTimeout(t);
      if (questionId in typed.current) getQueue().set(questionId, typed.current[questionId]);
    }
    timers.current = {};
    typed.current = {};
  }, [getQueue]);
  const onChange = (questionId: string, answer: Answer, debounce: boolean) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    setRefused(false);
    setSaveState("saving");
    clearTimeout(timers.current[questionId]);
    delete timers.current[questionId];
    delete typed.current[questionId];
    if (debounce) {
      typed.current[questionId] = answer;
      timers.current[questionId] = setTimeout(() => {
        delete timers.current[questionId];
        delete typed.current[questionId];
        getQueue().set(questionId, answer);
      }, 500);
    } else getQueue().set(questionId, answer);
  };

  // --- Submit (manual or automatic) -------------------------------------------------
  const submittedRef = useRef(false);
  const [submitRetrying, setSubmitRetrying] = useState(false);
  const doSubmit = useCallback(
    async (auto = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      const giveUp = (message: string) => {
        submittedRef.current = false;
        setSubmitting(false);
        setSaveError(message);
      };
      // Everything on the screen reaches the server before it grades (H1.2). At time-up the
      // wait is short: the server stops taking answers a few seconds after the deadline.
      flushTyping();
      const allSaved = await getQueue().flush(auto ? 3000 : 8000);
      if (!allSaved && !auto) {
        giveUp(
          "Some answers haven't saved yet. Check your wifi, then press Submit again. Your answers are still on this screen."
        );
        return;
      }
      let r: Awaited<ReturnType<typeof submitAttempt>>;
      try {
        r = await submitAttempt(attempt.id, auto);
      } catch {
        // The request itself failed. A time-up submit tries again by itself (the countdown
        // calls back in); a pressed Submit gives the button back.
        if (auto) {
          setSubmitRetrying(true);
          setTimeout(() => {
            submittedRef.current = false;
          }, 3000);
        } else giveUp(NO_CONNECTION);
        return;
      }
      setSubmitRetrying(false);
      // 423: the window closed, so the test paused instead (Finish later); show the paused screen.
      if (!r.ok && r.status === 423) {
        router.refresh();
        return;
      }
      // 404: the teacher deleted this attempt underneath us; the assignment page explains the state.
      if (r.ok || r.status === 409 || r.status === 404)
        router.push(`/student/assignments/${assignment.id}`);
      else giveUp(r.error);
    },
    [attempt.id, assignment.id, router, getQueue, flushTyping]
  );
  useEffect(() => {
    onRefused.current = (r) => {
      setRefused(true);
      setSaveError(r.error);
      if (r.status === 404) router.push(`/student/assignments/${assignment.id}`);
      if (r.status === 423) router.refresh(); // paused (idle or window closed)
      if (r.status === 409 && /Time is up/.test(r.error)) {
        setTimeUp(true);
        void doSubmit(true);
      }
    };
  }, [assignment.id, doSubmit, router]);

  useEffect(() => {
    if (!dueAtMs) return;
    const deadline = dueAtMs + (Date.now() - serverNowMs);
    const tick = () => {
      const left = deadline - Date.now();
      setRemaining(left);
      if (left <= 0) {
        setTimeUp(true);
        void doSubmit(true);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [dueAtMs, serverNowMs, doSubmit]);

  const toggleFlag = (questionId: string) => {
    const next = !flags.has(questionId);
    setFlags((prev) => {
      const s = new Set(prev);
      if (next) s.add(questionId);
      else s.delete(questionId);
      return s;
    });
    void setFlag(attempt.id, questionId, next).catch(() => undefined); // a flag is a note to self
  };

  // --- Finish later (Oct 13 2026) ---------------------------------------------------
  // Heartbeat: only real activity (typing, clicking, scrolling) keeps the test open;
  // after 10 minutes without any, the server pauses it.
  const lastInteraction = useRef(0);
  useEffect(() => {
    lastInteraction.current = Date.now(); // opening the test counts as activity
    const mark = () => {
      lastInteraction.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "scroll", "touchstart"] as const;
    for (const ev of events) window.addEventListener(ev, mark, { passive: true });
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInteraction.current > 120_000) return;
      void attemptHeartbeat(attempt.id)
        .then((r) => {
          if (r.ok && r.data.paused) router.refresh();
        })
        .catch(() => undefined); // offline: the save queue is what tells the student
    }, 60_000);
    return () => {
      for (const ev of events) window.removeEventListener(ev, mark);
      clearInterval(t);
    };
  }, [attempt.id, router]);
  const [pausing, setPausing] = useState<"idle" | "confirm" | "working">("idle");
  const pauseNow = async () => {
    setPausing("working");
    flushTyping();
    await getQueue().flush(5000); // what's on the screen is saved before it locks
    try {
      const r = await finishLater(attempt.id);
      if (r.ok || r.status === 423) router.refresh();
      else {
        setPausing("idle");
        setSaveError(r.error);
      }
    } catch {
      setPausing("idle");
      setSaveError(NO_CONNECTION);
    }
  };
  const locked = new Set(attempt.lockedQuestionIds);

  // --- Integrity: tab switches, full screen, font scale ------------------------------
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        void recordTabSwitch(attempt.id)
          .then((r) => {
            if (r.ok) setTabSwitches(r.data.tabSwitches);
          })
          .catch(() => undefined);
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
  const shownSave: SaveState = unsaved.failing || refused ? "error" : saveState;

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
            shownSave === "error" ? "font-medium text-error-foreground" : "text-muted-foreground"
          )}
          aria-live="polite"
          data-save-state={shownSave}
        >
          {shownSave === "saving"
            ? "Saving…"
            : shownSave === "saved"
              ? "Saved"
              : shownSave === "error"
                ? unsaved.failing
                  ? "Not saved. Trying again…"
                  : "Not saved"
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
          onClick={() => setPausing(pausing === "confirm" ? "idle" : "confirm")}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          data-finish-later
        >
          <PauseCircle className="size-4" aria-hidden />
          Finish later
        </button>
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
        {pausing !== "idle" ? (
          <section
            className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-brand-soft px-4 py-3 text-sm"
            aria-label="Finish later"
            data-finish-later-confirm
          >
            <p>
              <strong>Out of time?</strong> Your answers so far are saved and{" "}
              <strong>locked</strong>, and the clock stops. To finish, you&apos;ll need{" "}
              {assignment.teacherName}&apos;s resume code in class.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void pauseNow()}
                disabled={pausing === "working"}
              >
                {pausing === "working" ? "Pausing…" : "Pause and finish later"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPausing("idle")}>
                Keep working
              </Button>
            </div>
          </section>
        ) : null}
        {timeUp ? (
          <p
            role="alert"
            className="rounded-lg bg-coral-soft px-4 py-3 text-sm font-medium text-[#B93E27]"
          >
            {submitRetrying
              ? "Time is up. Couldn't reach Bloom, so it's trying again. Keep this tab open."
              : "Time is up. Submitting your answers…"}
          </p>
        ) : null}
        {unsaved.failing && !timeUp ? (
          <p
            role="alert"
            className="rounded-lg bg-error-soft px-4 py-2 text-sm text-error-foreground"
            data-unsaved={unsaved.pending}
          >
            <strong>
              {unsaved.pending === 1
                ? "1 answer hasn't saved yet."
                : `${unsaved.pending} answers haven't saved yet.`}
            </strong>{" "}
            Check your wifi. Bloom keeps trying, and your answers stay on this screen. Don&apos;t
            close this tab.
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
                {locked.has(q.id) ? (
                  <p className="mb-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                    <Lock className="size-3.5" aria-hidden />
                    Locked: you answered this before the test paused.
                  </p>
                ) : null}
                <fieldset disabled={locked.has(q.id)} className="disabled:opacity-70">
                  <AnswerInput
                    key={q.id}
                    question={q}
                    answer={answers[q.id] ?? null}
                    onChange={(a) => onChange(q.id, a, isText)}
                  />
                </fieldset>
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
