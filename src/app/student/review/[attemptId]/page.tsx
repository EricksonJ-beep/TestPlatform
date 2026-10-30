import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, Clock, X } from "lucide-react";
import { cn } from "cn";
import { isAuthzError, requireAttemptAccess } from "@/lib/authz";
import { getAttemptReview } from "@/lib/queries/results";
import {
  studentReviewBlock,
  toStudentReviewItems,
  type StudentReviewItem,
} from "@/lib/student-review";
import { RichText } from "@/components/rich-text";
import { StimulusPanel } from "@/components/stimulus/stimulus-panel";
import { TargetChip } from "@/components/targets/target-chip";

export const metadata: Metadata = { title: "Review answers" };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * A finished practice test, question by question: the student's answer, the correct answer,
 * and the explanation (Jon, Oct 30 2026). Read only; shown once results are released.
 * A server component on purpose: the key never reaches the browser as data, only as text.
 */
export default async function StudentReviewPage({
  params,
  searchParams,
}: PageProps<"/student/review/[attemptId]">) {
  const { attemptId } = await params;
  const { show } = await searchParams;
  let access;
  try {
    access = await requireAttemptAccess(attemptId);
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  if (access.as !== "student") notFound();
  const review = await getAttemptReview(attemptId);
  if (!review) notFound();
  const { attempt, assignment, perTarget } = review;
  const block = studentReviewBlock({
    type: assignment.type,
    resultsReleased: assignment.resultsReleased,
    status: attempt.status,
  });
  if (block === "not_practice") notFound();

  const back = (
    <Link
      href={`/student/assignments/${assignment.id}`}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden /> {assignment.title}
    </Link>
  );
  if (block) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {back}
        <p
          className="rounded-lg border border-border bg-card px-4 py-3 text-sm"
          data-review-blocked
        >
          {block === "in_progress"
            ? "Finish and submit this attempt first. Then you can review your answers here."
            : "Your teacher hasn't released results yet. Your answers show up here once they do."}
        </p>
      </div>
    );
  }

  const items = toStudentReviewItems(review.items);
  const missed = items.filter((i) => i.result === "incorrect" || i.result === "partial");
  const onlyMissed = show === "missed";
  const shown = onlyMissed ? missed : items;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4" data-student-review={attempt.id}>
      <div>
        {back}
        <h1 className="mt-2 text-2xl">Review attempt {attempt.number}</h1>
        <p className="mt-1 text-sm text-muted-foreground tabular" data-review-score>
          {attempt.score !== null && attempt.maxScore !== null
            ? `${fmt(attempt.score)} / ${fmt(attempt.maxScore)} · ${Math.round(attempt.percent ?? 0)}%`
            : "Not scored yet"}
          {" · "}
          {missed.length === 0 ? "nothing missed" : `${missed.length} missed`}
        </p>
        {perTarget.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Scores by target">
            {perTarget.map((t) => (
              <li key={t.code}>
                <TargetChip code={t.code} title={t.title} percent={t.percent} />
              </li>
            ))}
          </ul>
        ) : null}
        {missed.length > 0 ? (
          <nav className="mt-3 flex gap-1 text-sm" aria-label="Which questions">
            <Link
              href={`/student/review/${attempt.id}`}
              aria-current={onlyMissed ? undefined : "page"}
              className={cn(
                "rounded-md px-3 py-1.5",
                onlyMissed
                  ? "text-muted-foreground hover:bg-muted"
                  : "bg-brand-soft font-medium text-brand-deep"
              )}
            >
              All {items.length}
            </Link>
            <Link
              href={`/student/review/${attempt.id}?show=missed`}
              aria-current={onlyMissed ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5",
                onlyMissed
                  ? "bg-brand-soft font-medium text-brand-deep"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              Only missed {missed.length}
            </Link>
          </nav>
        ) : null}
      </div>

      <ol className="flex flex-col gap-3">
        {shown.map((item) => (
          <li key={item.questionId}>
            <ReviewCard item={item} />
          </li>
        ))}
      </ol>
    </div>
  );
}

const TONE: Record<StudentReviewItem["result"], string> = {
  correct: "border-success/40",
  partial: "border-warning/50",
  incorrect: "border-error/40",
  pending: "border-warning/50",
};

function ReviewCard({ item }: { item: StudentReviewItem }) {
  const right = item.result === "correct";
  return (
    <article
      className={cn(
        "rounded-lg border border-l-4 border-border bg-card px-5 py-4",
        TONE[item.result]
      )}
      data-review-item={item.order}
      data-result={item.result}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="tabular">Question {item.order}</span>
        {item.target ? <TargetChip code={item.target.code} title={item.target.title} /> : null}
        <span className="ml-auto tabular">
          {item.earned === null ? (
            <span className="inline-flex items-center gap-1 text-warning-foreground">
              <Clock className="size-3.5" aria-hidden /> Waiting for your teacher
            </span>
          ) : (
            <span
              className={cn(
                right
                  ? "text-success-foreground"
                  : item.result === "incorrect"
                    ? "text-error-foreground"
                    : "text-warning-foreground"
              )}
            >
              {right ? (
                <Check className="mr-1 inline size-3.5" aria-hidden />
              ) : item.result === "incorrect" ? (
                <X className="mr-1 inline size-3.5" aria-hidden />
              ) : null}
              {fmt(item.earned)} / {item.points}
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
        <div
          className={cn(
            "rounded-md px-3 py-2",
            right
              ? "bg-success-soft/50"
              : item.result === "pending"
                ? "bg-muted/60"
                : "bg-coral-soft/50"
          )}
        >
          <dt className="text-xs font-medium text-muted-foreground">Your answer</dt>
          <dd className="mt-0.5 whitespace-pre-wrap" data-student-answer>
            {item.studentAnswer}
          </dd>
        </div>
        <div className="rounded-md bg-success-soft/50 px-3 py-2">
          <dt className="text-xs font-medium text-muted-foreground">Correct answer</dt>
          <dd className="mt-0.5 whitespace-pre-wrap" data-correct-answer>
            {item.correctAnswer ?? "Your teacher grades this one."}
          </dd>
        </div>
      </dl>
      {item.explanation ? (
        <div className="mt-2 text-sm" data-explanation>
          <span className="text-xs font-medium text-muted-foreground">Why: </span>
          <RichText text={item.explanation} />
        </div>
      ) : null}
      {item.teacherNote ? (
        <p className="mt-2 rounded-md border border-border px-3 py-2 text-sm" data-teacher-note>
          <span className="text-xs font-medium text-muted-foreground">From your teacher: </span>
          {item.teacherNote}
        </p>
      ) : null}
    </article>
  );
}
