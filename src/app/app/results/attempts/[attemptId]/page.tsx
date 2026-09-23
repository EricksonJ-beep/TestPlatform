import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireAttemptAccess } from "@/lib/authz";
import { getAttemptReview } from "@/lib/queries/results";
import { LocalTime } from "@/components/local-time";
import { TargetChip } from "@/components/targets/target-chip";
import { Badge } from "@/components/ui/badge";
import { ReviewItemCard } from "./review-item";

export const metadata: Metadata = { title: "Attempt review" };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** One student's attempt, question by question: their answer against the key, with grading and overrides. */
export default async function AttemptReviewPage({
  params,
}: PageProps<"/app/results/attempts/[attemptId]">) {
  const { attemptId } = await params;
  let access;
  try {
    access = await requireAttemptAccess(attemptId);
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  if (access.as !== "teacher") notFound();
  const review = await getAttemptReview(attemptId);
  if (!review) notFound();
  const { attempt, student, assignment, items, perTarget } = review;
  const pending = items.filter(
    (i) => i.response && i.response.autoScore === null && i.response.manualScore === null
  ).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <Link
          href={`/app/results/${assignment.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> {assignment.title} · {assignment.className}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl">
            {student.firstName} {student.lastName}
          </h1>
          <Badge variant="secondary">Attempt {attempt.number}</Badge>
          {attempt.status === "in_progress" ? (
            <Badge className="bg-brand-soft text-brand-deep">In progress</Badge>
          ) : pending > 0 ? (
            <Badge className="bg-warning-soft text-warning-foreground">{pending} to grade</Badge>
          ) : (
            <Badge className="bg-success-soft text-success-foreground">Graded</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground tabular" data-attempt-score>
          {attempt.score !== null && attempt.maxScore !== null
            ? `${fmt(attempt.score)} / ${fmt(attempt.maxScore)} · ${Math.round(attempt.percent ?? 0)}%`
            : "Not scored yet"}
          {attempt.submittedAt ? (
            <>
              {" · submitted "}
              <LocalTime date={attempt.submittedAt} />
            </>
          ) : null}
          {attempt.tabSwitches > 0
            ? ` · ${attempt.tabSwitches} tab ${attempt.tabSwitches === 1 ? "switch" : "switches"}`
            : ""}
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
      </div>

      {attempt.status === "in_progress" ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          The student is still working. Answers appear here as they save; grading opens after they
          submit.
        </p>
      ) : null}

      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.questionId}>
            <ReviewItemCard
              attemptId={attempt.id}
              item={item}
              locked={attempt.status === "in_progress"}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
