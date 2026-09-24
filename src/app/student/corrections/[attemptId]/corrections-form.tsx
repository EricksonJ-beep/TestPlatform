"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Lightbulb, Lock, X } from "lucide-react";
import { cn } from "cn";
import { correctionIssues, ISSUE_TEXT, type CorrectionIssue } from "@/lib/corrections";
import type { CorrectionItem, CorrectionsForm as FormPayload } from "@/lib/queries/corrections";
import { RichText } from "@/components/rich-text";
import { StimulusPanel } from "@/components/stimulus/stimulus-panel";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveCorrection, submitCorrections } from "../actions";

type Draft = { correctAnswer: string; explanation: string };
type SaveState = "idle" | "saving" | "saved" | "error";

const isChoice = (t: CorrectionItem["type"]) =>
  t === "multiple_choice" || t === "true_false" || t === "multiple_select";

/** Client-side completeness (no copy check here: the explanation never reaches the browser). */
function localIssues(d: Draft): CorrectionIssue[] {
  return correctionIssues(d, { explanation: null });
}

/**
 * Corrections · one missed question at a time: the student's answer marked
 * wrong, a hint, and two required fields. Autosaves on every keystroke;
 * Previous / Save & next; revise freely until the final submit.
 */
export function CorrectionsForm({ form }: { form: FormPayload }) {
  const router = useRouter();
  const { items, summary, editable } = form;
  const total = items.length;
  const [idx, setIdx] = useState(() => {
    const first = items.findIndex((i) => localIssues(draftOf(i)).length > 0);
    return first === -1 ? 0 : first;
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(items.map((i) => [i.questionId, draftOf(i)]))
  );
  const [serverIssues, setServerIssues] = useState<Record<string, string[]>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const item = items[idx];
  const draft = drafts[item.questionId];
  const complete = (q: CorrectionItem) =>
    localIssues(drafts[q.questionId]).length === 0 && !serverIssues[q.questionId]?.length;
  const doneCount = items.filter(complete).length;
  const allDone = doneCount === total;

  // --- Autosave -------------------------------------------------------------
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const persist = useCallback(
    (questionId: string, d: Draft) => {
      setSaveState("saving");
      void saveCorrection(form.attempt.id, questionId, d).then((r) => {
        if (r.ok) {
          setSaveState("saved");
          setError(null);
          setServerIssues((prev) => ({
            ...prev,
            [questionId]: r.data.issues.map((i) => ISSUE_TEXT[i]),
          }));
        } else {
          setSaveState("error");
          setError(r.error);
        }
      });
    },
    [form.attempt.id]
  );
  const onChange = (field: keyof Draft, value: string) => {
    const next = { ...draft, [field]: value };
    setDrafts((prev) => ({ ...prev, [item.questionId]: next }));
    clearTimeout(timers.current[item.questionId]);
    setSaveState("saving");
    timers.current[item.questionId] = setTimeout(() => persist(item.questionId, next), 500);
  };
  const flush = () => {
    const t = timers.current[item.questionId];
    if (t) {
      clearTimeout(t);
      persist(item.questionId, drafts[item.questionId]);
    }
  };
  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const submit = async () => {
    setSubmitting(true);
    const r = await submitCorrections(form.attempt.id);
    setSubmitting(false);
    if (r.ok) {
      router.push(`/student/assignments/${form.assignment.id}`);
      router.refresh();
    } else {
      setConfirm(false);
      setError(r.error);
      if (r.fieldErrors) {
        setServerIssues((prev) => ({ ...prev, ...r.fieldErrors }));
        const firstBad = items.findIndex((i) => r.fieldErrors?.[i.questionId]?.length);
        if (firstBad >= 0) setIdx(firstBad);
      }
    }
  };

  const shownIssues = editable
    ? [...localIssues(draft).map((i) => ISSUE_TEXT[i]), ...(serverIssues[item.questionId] ?? [])]
    : [];
  const uniqueIssues = [...new Set(shownIssues)];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4" data-corrections={form.attempt.id}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-2xl">Corrections · {form.assignment.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            Attempt {form.attempt.number} · {total} {total === 1 ? "question" : "questions"} to
            correct
          </p>
        </div>
        <span
          className={cn(
            "text-xs",
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
      </div>

      {summary.state === "submitted" ? (
        <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm text-brand-deep" role="status">
          Submitted. Your teacher will read these and approve them or send them back.
        </p>
      ) : summary.state === "approved" ? (
        <p
          className="rounded-lg bg-success-soft px-4 py-3 text-sm text-success-foreground"
          role="status"
        >
          Approved. Your corrections are done.
        </p>
      ) : summary.state === "returned" ? (
        <div
          className="rounded-lg border border-warning/60 bg-warning-soft px-4 py-3 text-sm"
          role="alert"
          data-returned-note
        >
          <p className="font-medium text-warning-foreground">
            Your teacher sent these back. Fix them and submit again.
          </p>
          {summary.reviewerNote ? (
            <p className="mt-1 whitespace-pre-wrap">{summary.reviewerNote}</p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-error-soft px-4 py-2 text-sm text-error-foreground"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="tabular">
          Question {idx + 1} of {total}
        </span>
        {item.target ? (
          <TargetChip
            code={item.target.code}
            title={item.target.title}
            percent={item.target.percent}
            tone={item.target.percent !== null && item.target.percent < 80 ? "required" : "default"}
          />
        ) : null}
        <span className="ml-auto tabular">
          {item.earned} / {item.points} on the test
        </span>
      </div>

      {item.stimulus ? <StimulusPanel stimulus={item.stimulus} /> : null}
      <article className="rounded-lg border border-border bg-card px-5 py-4">
        <RichText text={item.stem} as="p" className="text-[15px] leading-relaxed" />
        {item.mediaUrl ? (
          <div className="mt-3 rounded-lg bg-brand-soft p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.mediaUrl} alt="" className="max-h-96 max-w-full rounded-md bg-white" />
          </div>
        ) : null}

        {isChoice(item.type) ? (
          <ul className="mt-4 grid gap-2" aria-label="Answer choices">
            {item.options.map((o, i) => {
              const picked = item.chosenOptionIds.includes(o.id);
              return (
                <li
                  key={o.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-4 py-3 text-[15px] leading-snug",
                    picked
                      ? "border-error/60 bg-error-soft text-error-foreground"
                      : "border-border text-muted-foreground"
                  )}
                  data-picked={picked ? "" : undefined}
                >
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular">
                    {picked ? <X className="size-4" aria-hidden /> : String.fromCharCode(65 + i)}
                  </span>
                  <RichText text={o.content} />
                  {picked ? <span className="ml-auto text-xs font-medium">Your answer</span> : null}
                </li>
              );
            })}
            {item.chosenOptionIds.length === 0 ? (
              <li className="text-sm text-error-foreground">You left this blank.</li>
            ) : null}
          </ul>
        ) : (
          <div className="mt-4 rounded-md border border-error/60 bg-error-soft px-3 py-2 text-sm">
            <p className="text-xs font-medium text-error-foreground">Your answer</p>
            <p className="mt-0.5 whitespace-pre-wrap" data-student-answer>
              {item.studentAnswerText}
            </p>
          </div>
        )}

        {item.hint ? (
          <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden />
            <span>
              <span className="font-medium">Hint: </span>
              {item.hint}
            </span>
          </p>
        ) : null}
      </article>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card px-5 py-4">
        <div className="grid gap-1.5">
          <Label htmlFor="c-answer">Correct answer</Label>
          <Textarea
            id="c-answer"
            rows={2}
            value={draft.correctAnswer}
            disabled={!editable}
            onChange={(e) => onChange("correctAnswer", e.target.value)}
            onBlur={flush}
            placeholder="What is the right answer?"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="c-why">Why is this correct? Explain in your own words</Label>
          <Textarea
            id="c-why"
            rows={4}
            value={draft.explanation}
            disabled={!editable}
            onChange={(e) => onChange("explanation", e.target.value)}
            onBlur={flush}
            placeholder="At least two sentences. Say why the right answer works, or why yours didn't."
          />
          {uniqueIssues.length ? (
            <ul className="text-xs text-warning-foreground" data-issues>
              {uniqueIssues.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : editable ? (
            <p className="inline-flex items-center gap-1 text-xs text-success-foreground">
              <Check className="size-3.5" aria-hidden /> Complete
            </p>
          ) : null}
          {item.correction?.reviewerNote && item.correction.status === "returned" ? (
            <p className="mt-1 rounded-md border border-border px-3 py-2 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Teacher: </span>
              {item.correction.reviewerNote}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={idx === 0}
          onClick={() => {
            flush();
            setIdx((i) => Math.max(0, i - 1));
          }}
        >
          <ChevronLeft data-icon="inline-start" aria-hidden />
          Previous
        </Button>
        <nav aria-label="Corrections navigator" className="flex flex-wrap gap-1.5">
          {items.map((q, i) => (
            <button
              key={q.questionId}
              type="button"
              aria-current={i === idx ? "step" : undefined}
              aria-label={`Question ${i + 1}${complete(q) ? ", complete" : ""}`}
              onClick={() => {
                flush();
                setIdx(i);
              }}
              className={cn(
                "size-9 rounded-md border text-sm font-medium tabular transition-colors",
                i === idx ? "border-brand ring-2 ring-brand/40" : "border-border",
                complete(q)
                  ? "bg-success-soft text-success-foreground"
                  : "bg-card text-muted-foreground"
              )}
            >
              {i + 1}
            </button>
          ))}
        </nav>
        <div className="ml-auto">
          {idx < total - 1 ? (
            <Button
              type="button"
              size="lg"
              onClick={() => {
                flush();
                setIdx((i) => Math.min(total - 1, i + 1));
              }}
            >
              {editable ? "Save & next" : "Next"}
              <ChevronRight data-icon="inline-end" aria-hidden />
            </Button>
          ) : editable ? (
            <Button
              type="button"
              size="lg"
              disabled={!allDone || submitting}
              onClick={() => {
                flush();
                setConfirm(true);
              }}
            >
              Submit corrections
            </Button>
          ) : null}
        </div>
      </div>

      {confirm ? (
        <div
          role="alertdialog"
          aria-label="Submit corrections?"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-brand bg-brand-soft px-4 py-3 text-sm"
        >
          <span className="mr-auto">
            Submit all {total} corrections?{" "}
            {form.assignment.reviewMode === "auto"
              ? "They'll count right away."
              : "Your teacher will review them."}
          </span>
          <Button type="button" variant="outline" onClick={() => setConfirm(false)}>
            Keep working
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void submit()}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
      ) : null}

      <footer className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Lock className="size-3.5" aria-hidden />
          <span className="tabular">
            {summary.state === "approved"
              ? "Corrections approved"
              : summary.state === "submitted"
                ? "Waiting for your teacher"
                : `Retake unlocks after ${total} ${total === 1 ? "correction" : "corrections"}`}
          </span>
          <span className="ml-auto tabular">
            {doneCount} of {total}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-brand transition-[width]"
            style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
          />
        </div>
      </footer>
    </div>
  );
}

function draftOf(i: CorrectionItem): Draft {
  return {
    correctAnswer: i.correction?.correctAnswer ?? "",
    explanation: i.correction?.explanation ?? "",
  };
}
