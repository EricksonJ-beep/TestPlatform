import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { listCorrectionsQueue } from "@/lib/queries/corrections";
import { EmptyState } from "@/components/empty-state";
import { CorrectionsQueue } from "./queue";

export const metadata: Metadata = { title: "Corrections queue" };

/** PLAN.md §5 6a: one card per submitted correction set; A approves, R returns with a note. */
export default async function CorrectionsQueuePage() {
  const session = await requireTeacher();
  const cards = await listCorrectionsQueue(session.userId);
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
          {cards.length} {cards.length === 1 ? "set" : "sets"} waiting. Approving unlocks the
          student&apos;s retake right away. Keys: <kbd className="rounded border px-1">A</kbd>{" "}
          approve · <kbd className="rounded border px-1">R</kbd> return ·{" "}
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
        <CorrectionsQueue cards={cards} />
      )}
    </div>
  );
}
