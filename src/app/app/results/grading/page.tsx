import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { splitByCourse } from "@/lib/course-focus";
import { getCurrentCourse } from "@/lib/current-course";
import { answerToText } from "@/lib/grading";
import { listGradingQueue } from "@/lib/queries/results";
import { EmptyState } from "@/components/empty-state";
import { LocalTime } from "@/components/local-time";
import { RichText } from "@/components/rich-text";
import { GradeForm } from "../grade-form";

export const metadata: Metadata = { title: "Grading queue" };

/** Every short answer and extended response still waiting for a score, oldest first. */
export default async function GradingQueuePage() {
  const session = await requireTeacher();
  const [allItems, { current }] = await Promise.all([
    listGradingQueue(session.userId),
    getCurrentCourse(session.userId),
  ]);
  // Course focus: this course's responses (plus any whose assessment has no course).
  const split = splitByCourse(allItems, current);
  const items = [...split.mine, ...split.orphans];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <Link
          href="/app/results"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> Results
        </Link>
        <h1 className="mt-2 text-2xl">Grading queue</h1>
        <p className="mt-1 text-sm text-muted-foreground tabular">
          {items.length} {items.length === 1 ? "response" : "responses"} waiting
          {current ? ` in ${current.name}` : ""}. Scores update the student&apos;s attempt and final
          score the moment you save.
          {split.elsewhere > 0 ? (
            <span data-elsewhere>
              {" "}
              {split.elsewhere} more in other courses; switch course in the sidebar to see them.
            </span>
          ) : null}
        </p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={CheckCircle2}
            title="Nothing to grade"
            description="Short answers and extended responses land here as students submit."
          />
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {items.map((it) => (
            <li
              key={`${it.attemptId}-${it.questionId}`}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
              data-queue-item
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{it.studentName}</span>
                <span>
                  · {it.assignmentTitle} · {it.className} · attempt {it.attemptNumber}
                </span>
                {it.submittedAt ? (
                  <span>
                    · <LocalTime date={it.submittedAt} />
                  </span>
                ) : null}
                <Link
                  href={`/app/results/attempts/${it.attemptId}`}
                  className="ml-auto text-brand-deep hover:underline"
                >
                  Whole attempt
                </Link>
              </div>
              <RichText text={it.stem} as="p" className="text-[15px] leading-relaxed" />
              <blockquote className="rounded-md bg-muted/60 px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap">
                {answerToText(
                  {
                    id: it.questionId,
                    type: it.type,
                    points: it.points,
                    grading: "manual",
                    gradingConfig: it.gradingConfig,
                    options: [],
                  },
                  it.answer
                )}
              </blockquote>
              <GradeForm
                attemptId={it.attemptId}
                questionId={it.questionId}
                maxPoints={it.points}
                current={null}
                autoScore={null}
                compact
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
