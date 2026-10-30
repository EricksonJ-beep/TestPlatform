"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Pencil } from "lucide-react";
import { cn } from "cn";
import type { ClassReviewItem } from "@/lib/queries/results";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";

const HARD_MAX = 0.5;

/**
 * Big, calm cards for the projector: one question at a time or all at once,
 * answers hidden until you reveal them, bars for what the class picked.
 */
export function ClassReview({
  assignmentId,
  items,
}: {
  assignmentId: string;
  items: ClassReviewItem[];
}) {
  const [onlyHard, setOnlyHard] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [oneAtATime, setOneAtATime] = useState(true);
  const [index, setIndex] = useState(0);

  const hard = items.filter((i) => i.rate !== null && i.rate <= HARD_MAX);
  const shown = onlyHard ? hard : items;
  const current = Math.min(index, Math.max(0, shown.length - 1));
  const back = `?back=${encodeURIComponent(`/app/results/${assignmentId}/review`)}`;

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        No submissions yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-class-review>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-brand"
            checked={onlyHard}
            onChange={(e) => {
              setOnlyHard(e.target.checked);
              setIndex(0);
            }}
          />
          Only questions under 50% ({hard.length} of {items.length})
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-brand"
            checked={oneAtATime}
            onChange={(e) => setOneAtATime(e.target.checked)}
          />
          One at a time
        </label>
        <Button
          size="sm"
          variant={reveal ? "default" : "outline"}
          className="ml-auto"
          onClick={() => setReveal((v) => !v)}
          aria-pressed={reveal}
        >
          {reveal ? (
            <EyeOff data-icon="inline-start" aria-hidden />
          ) : (
            <Eye data-icon="inline-start" aria-hidden />
          )}
          {reveal ? "Hide answers" : "Reveal answers"}
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Every question is above 50%. Untick the filter to review them all.
        </p>
      ) : oneAtATime ? (
        <>
          <ReviewCard item={shown[current]} reveal={reveal} back={back} />
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              disabled={current === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft data-icon="inline-start" aria-hidden />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground tabular">
              {current + 1} of {shown.length}
            </span>
            <Button
              variant="outline"
              disabled={current >= shown.length - 1}
              onClick={() => setIndex((i) => Math.min(shown.length - 1, i + 1))}
            >
              Next
              <ChevronRight data-icon="inline-end" aria-hidden />
            </Button>
          </div>
        </>
      ) : (
        shown.map((item) => (
          <ReviewCard key={item.questionId} item={item} reveal={reveal} back={back} />
        ))
      )}
    </div>
  );
}

function ReviewCard({
  item,
  reveal,
  back,
}: {
  item: ClassReviewItem;
  reveal: boolean;
  back: string;
}) {
  const pct = item.rate === null ? null : Math.round(item.rate * 100);
  const total = Math.max(1, item.answered + item.blank);
  return (
    <article
      className="rounded-lg border border-border bg-card px-6 py-5"
      data-review-question={item.questionId}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {item.targetCode ? <span className="font-medium">{item.targetCode}</span> : null}
        <span className="tabular">
          {item.correct} of {item.answered} correct
          {pct !== null ? ` · ${pct}%` : ""}
        </span>
        <Link
          href={`/app/banks/${item.bankId}/questions/${item.questionId}${back}`}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-deep hover:underline"
        >
          <Pencil className="size-3" aria-hidden /> Edit question
        </Link>
      </div>
      <RichText text={item.stem} as="p" className="text-xl leading-relaxed" />
      {item.mediaUrl ? (
        <div className="mt-3 rounded-lg bg-brand-soft p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.mediaUrl} alt="" className="max-h-96 max-w-full rounded-md bg-white" />
        </div>
      ) : null}

      {item.options.length > 0 ? (
        <ol className="mt-4 flex flex-col gap-2">
          {item.options.map((o, i) => {
            const share = Math.round((o.picked / total) * 100);
            const right = reveal && o.isCorrect;
            return (
              <li
                key={o.id}
                className={cn(
                  "relative overflow-hidden rounded-lg border px-4 py-3 text-lg",
                  right ? "border-success bg-success-soft" : "border-border"
                )}
                data-option={o.id}
                data-correct={reveal ? o.isCorrect : undefined}
              >
                <span
                  className={cn(
                    "absolute inset-y-0 left-0",
                    right ? "bg-success/15" : "bg-brand-soft/70"
                  )}
                  style={{ width: `${share}%` }}
                  aria-hidden
                />
                <span className="relative flex items-center gap-3">
                  <span className="w-6 shrink-0 font-semibold text-muted-foreground">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <RichText text={o.content} as="span" className="flex-1" />
                  {right ? <Check className="size-5 shrink-0 text-success-foreground" aria-hidden /> : null}
                  <span className="shrink-0 text-sm text-muted-foreground tabular">
                    {o.picked} · {share}%
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-4">
          <p className="text-sm font-medium text-muted-foreground">What students wrote</p>
          {item.answers.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No answers yet.</p>
          ) : (
            <ol className="mt-2 flex flex-col gap-2">
              {item.answers.map((a) => {
                const share = Math.round((a.count / total) * 100);
                const right = reveal && a.correct === true;
                return (
                  <li
                    key={a.text}
                    className={cn(
                      "relative overflow-hidden rounded-lg border px-4 py-3 text-lg",
                      right ? "border-success bg-success-soft" : "border-border"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0",
                        right ? "bg-success/15" : "bg-brand-soft/70"
                      )}
                      style={{ width: `${share}%` }}
                      aria-hidden
                    />
                    <span className="relative flex items-center gap-3">
                      <span className="flex-1 break-words">{a.text}</span>
                      {right ? (
                        <Check className="size-5 shrink-0 text-success-foreground" aria-hidden />
                      ) : null}
                      <span className="shrink-0 text-sm text-muted-foreground tabular">
                        {a.count} · {share}%
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {reveal && item.keyText ? (
            <p className="mt-3 text-base">
              <span className="font-medium text-success-foreground">Answer:</span> {item.keyText}
            </p>
          ) : null}
        </div>
      )}

      {item.blank > 0 ? (
        <p className="mt-3 text-sm text-muted-foreground tabular">
          {item.blank} left it blank
        </p>
      ) : null}
      {reveal && item.explanation ? (
        <div className="mt-4 rounded-lg bg-muted px-4 py-3 text-base">
          <RichText text={item.explanation} as="p" />
        </div>
      ) : null}
    </article>
  );
}
