import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { isUuid, requireTeacher } from "@/lib/authz";
import { focusQueue } from "@/lib/course-focus";
import { getCurrentCourse } from "@/lib/current-course";
import { listCorrectionsQueue } from "@/lib/queries/corrections";
import { EmptyState } from "@/components/empty-state";
import { CorrectionsQueue } from "./queue";

export const metadata: Metadata = { title: "Corrections queue" };

/**
 * PLAN.md §5 6a: one card per submitted correction set; A approves, R returns with a note.
 * `?assignment=` (from the Dashboard's "Needs you", Jon Oct 13 2026) narrows to one test in
 * any course.
 */
export default async function CorrectionsQueuePage({
  searchParams,
}: PageProps<"/app/results/corrections">) {
  const session = await requireTeacher();
  const sp = await searchParams;
  const only = isUuid(sp.assignment) ? sp.assignment : null;
  const [allCards, { current }] = await Promise.all([
    listCorrectionsQueue(session.userId),
    getCurrentCourse(session.userId),
  ]);
  // Course focus: this course's sets (plus any whose assessment has no course), or one test.
  const { items: cards, elsewhere } = focusQueue(allCards, current, only);
  const test = only ? allCards.find((c) => c.assignmentId === only) : undefined;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <Link
          href="/app/results"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> Results
        </Link>
        <h1 className="mt-2 text-2xl">Corrections queue</h1>
        <p className="mt-1 text-sm text-muted-foreground tabular">
          {cards.length} {cards.length === 1 ? "set" : "sets"} waiting
          {only ? (
            <span data-filtered>
              {test ? ` on ${test.assignmentTitle} · ${test.className}` : " on this test"} (
              <Link href="/app/results/corrections" className="text-brand-deep hover:underline">
                show all
              </Link>
              )
            </span>
          ) : current ? (
            ` in ${current.name}`
          ) : (
            ""
          )}
          {elsewhere > 0 ? <span data-elsewhere> ({elsewhere} more in other courses)</span> : null}.
          Approving unlocks the student&apos;s retake right away. Keys:{" "}
          <kbd className="rounded border px-1">A</kbd> approve ·{" "}
          <kbd className="rounded border px-1">R</kbd> return ·{" "}
          <kbd className="rounded border px-1">J</kbd>/<kbd className="rounded border px-1">K</kbd>{" "}
          next/previous · <kbd className="rounded border px-1">E</kbd> expand.
        </p>
      </div>
      {cards.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={CheckCircle2}
            title="Nothing to review"
            description="Sets land here when a student submits corrections on an assignment set to teacher-approved review."
          />
        </div>
      ) : (
        <CorrectionsQueue key={only ?? "all"} cards={cards} />
      )}
    </div>
  );
}
