"use client";

import { useState } from "react";
import { Check, Flag, Pencil, X } from "lucide-react";
import { cn } from "cn";
import { answerToText, correctAnswerText } from "@/lib/grading";
import type { ReviewItem } from "@/lib/queries/results";
import { RichText } from "@/components/rich-text";
import { StimulusPanel } from "@/components/stimulus/stimulus-panel";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { GradeForm } from "../../grade-form";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** One question in the review: student answer vs. key, score, and the override/grade form. */
export function ReviewItemCard({
  attemptId,
  item,
  locked,
}: {
  attemptId: string;
  item: ReviewItem;
  locked: boolean;
}) {
  const r = item.response;
  const gradable = {
    id: item.questionId,
    type: item.type,
    points: item.points,
    grading: item.grading,
    gradingConfig: item.gradingConfig,
    options: item.options,
  };
  const studentText = answerToText(gradable, r?.answer ?? null);
  const keyText = correctAnswerText(gradable);
  const pendingManual = !!r && r.autoScore === null && r.manualScore === null;
  const overridden = !!r && r.manualScore !== null;
  const earned = r ? (r.manualScore ?? r.autoScore) : null;
  const [editing, setEditing] = useState(false);
  const showForm = !locked && (pendingManual || editing);

  const tone =
    earned === null
      ? "border-warning/50"
      : earned >= item.points
        ? "border-success/40"
        : earned > 0
          ? "border-warning/50"
          : "border-error/40";

  return (
    <article
      className={cn("rounded-lg border border-l-4 border-border bg-card px-5 py-4", tone)}
      data-review-item={item.order}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="tabular">Question {item.order}</span>
        {item.target ? <TargetChip code={item.target.code} title={item.target.title} /> : null}
        {r?.flagged ? (
          <span className="inline-flex items-center gap-1 text-warning-foreground">
            <Flag className="size-3" aria-hidden /> flagged
          </span>
        ) : null}
        <span className="ml-auto tabular" data-item-score>
          {earned === null ? (
            <span className="text-warning-foreground">Needs grading · {item.points} pts</span>
          ) : (
            <span
              className={cn(
                earned >= item.points
                  ? "text-success-foreground"
                  : earned === 0
                    ? "text-error-foreground"
                    : "text-warning-foreground"
              )}
            >
              {earned >= item.points ? (
                <Check className="mr-1 inline size-3.5" aria-hidden />
              ) : earned === 0 ? (
                <X className="mr-1 inline size-3.5" aria-hidden />
              ) : null}
              {fmt(earned)} / {item.points}
              {overridden ? " · teacher" : ""}
            </span>
          )}
        </span>
      </div>
      {item.stimulus ? <StimulusPanel stimulus={item.stimulus} className="mb-3" /> : null}
      <RichText text={item.stem} as="p" className="text-[15px] leading-relaxed" />
      {item.mediaUrl ? (
        <div className="mt-3 rounded-lg bg-brand-soft p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.mediaUrl} alt="" className="max-h-72 max-w-full rounded-md bg-white" />
        </div>
      ) : null}

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-md bg-muted/60 px-3 py-2">
          <dt className="text-xs font-medium text-muted-foreground">Student answer</dt>
          <dd className="mt-0.5 whitespace-pre-wrap" data-student-answer>
            {studentText}
          </dd>
        </div>
        <div className="rounded-md bg-success-soft/50 px-3 py-2">
          <dt className="text-xs font-medium text-muted-foreground">Answer key</dt>
          <dd className="mt-0.5 whitespace-pre-wrap">
            {keyText ??
              (item.grading === "manual" || item.type === "extended_response"
                ? "Graded by you"
                : "—")}
          </dd>
        </div>
      </dl>
      {item.explanation ? (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium">Explanation:</span> <RichText text={item.explanation} />
        </p>
      ) : null}
      {r?.graderNote ? (
        <p className="mt-2 rounded-md border border-border px-3 py-2 text-sm" data-grader-note>
          <span className="text-xs font-medium text-muted-foreground">Your note: </span>
          {r.graderNote}
        </p>
      ) : null}
      {item.correction ? (
        <div
          className="mt-3 rounded-md border border-dashed border-brand/50 px-3 py-2 text-sm"
          data-correction
        >
          <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            Correction
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5",
                item.correction.status === "approved"
                  ? "bg-success-soft text-success-foreground"
                  : item.correction.status === "returned"
                    ? "bg-warning-soft text-warning-foreground"
                    : item.correction.status === "submitted"
                      ? "bg-brand-soft text-brand-deep"
                      : "bg-muted"
              )}
            >
              {item.correction.status}
            </span>
            {item.correction.aiFlag ? (
              <span className="text-warning-foreground">AI flagged</span>
            ) : null}
          </p>
          <p className="mt-1">
            <span className="text-xs font-medium text-muted-foreground">Their answer: </span>
            <span className="whitespace-pre-wrap">{item.correction.correctAnswer || "—"}</span>
          </p>
          <p className="mt-1">
            <span className="text-xs font-medium text-muted-foreground">Why: </span>
            <span className="whitespace-pre-wrap">{item.correction.explanation || "—"}</span>
          </p>
          {item.correction.reviewerNote ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Your note: {item.correction.reviewerNote}
            </p>
          ) : null}
        </div>
      ) : null}

      {showForm ? (
        <div className="mt-3 border-t border-border pt-3">
          <GradeForm
            attemptId={attemptId}
            questionId={item.questionId}
            maxPoints={item.points}
            current={
              r && r.manualScore !== null ? { points: r.manualScore, note: r.graderNote } : null
            }
            autoScore={r?.autoScore ?? null}
            onSaved={() => setEditing(false)}
            compact
          />
        </div>
      ) : !locked ? (
        <div className="mt-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil data-icon="inline-start" aria-hidden />
            {overridden ? "Change override" : "Override score"}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
