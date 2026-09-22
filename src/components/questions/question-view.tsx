"use client";

import { cn } from "cn";
import { RichText } from "@/components/rich-text";
import { TargetChip } from "@/components/targets/target-chip";
import type { BankQuestionRow } from "@/lib/queries/banks";

/**
 * A question as a student sees it (PLAN.md §5 screen 3): stem at 15px, media in
 * a soft panel, large tappable answer rows. Read-only here; the live test
 * screen (Ticket 1.9) adds answering and autosave on top of this layout.
 */
export function QuestionView({
  question,
  number,
  total,
  showTarget = true,
  className,
}: {
  question: BankQuestionRow;
  number?: number;
  total?: number;
  showTarget?: boolean;
  className?: string;
}) {
  const q = question;
  const numbered = number !== undefined;
  const isChoice =
    q.type === "multiple_choice" || q.type === "multiple_select" || q.type === "true_false";
  return (
    <article className={cn("rounded-lg border border-border bg-card px-5 py-4", className)}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        {numbered ? (
          <span className="tabular">
            Question {number}
            {total ? ` of ${total}` : ""}
          </span>
        ) : null}
        {showTarget
          ? q.targets.map((t) => <TargetChip key={t.id} code={t.code} title={t.title} />)
          : null}
        <span className="ml-auto tabular">
          {q.points} {q.points === 1 ? "point" : "points"}
        </span>
      </div>
      <RichText text={q.stem} as="p" className="text-[15px] leading-relaxed" />
      {q.mediaUrl ? (
        <div className="mt-3 rounded-lg bg-brand-soft p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={q.mediaUrl} alt="" className="max-h-80 max-w-full rounded-md bg-white" />
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
            <video src={q.videoUrl} controls className="w-full max-w-xl rounded-md bg-black" />
          )}
        </div>
      ) : null}

      <div className="mt-3">
        {isChoice ? (
          <ol className="grid gap-2">
            {q.options.map((o, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-[15px]"
              >
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-muted-foreground tabular">
                  {String.fromCharCode(65 + i)}
                </span>
                <RichText text={o.content} />
              </li>
            ))}
          </ol>
        ) : q.type === "matching" ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {q.options.map((o, i) => (
              <li key={i} className="rounded-lg border border-border px-4 py-2 text-sm">
                <RichText text={o.content} />
                <span className="text-muted-foreground"> → ____</span>
              </li>
            ))}
          </ul>
        ) : q.type === "ordering" ? (
          <ol className="grid gap-2">
            {q.options.map((o, i) => (
              <li key={i} className="rounded-lg border border-border px-4 py-2 text-sm">
                <span className="mr-2 text-muted-foreground tabular">≡</span>
                <RichText text={o.content} />
              </li>
            ))}
          </ol>
        ) : q.type === "numeric" ? (
          <div className="flex h-11 w-56 items-center rounded-lg border border-input px-3 text-sm text-muted-foreground">
            Enter a number
            {(q.gradingConfig as { unit?: string } | null)?.unit
              ? ` (${(q.gradingConfig as { unit?: string }).unit})`
              : ""}
          </div>
        ) : q.type === "fill_blank" || q.type === "short_answer" ? (
          <div className="flex h-11 w-full max-w-md items-center rounded-lg border border-input px-3 text-sm text-muted-foreground">
            Type your answer
          </div>
        ) : (
          <div className="flex h-28 w-full items-start rounded-lg border border-input px-3 py-2 text-sm text-muted-foreground">
            Write your response
          </div>
        )}
      </div>
    </article>
  );
}
