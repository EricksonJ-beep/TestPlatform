import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ClipboardCheck, MessageSquareText } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { listTeacherAssignments } from "@/lib/queries/assignments";
import { countCorrectionsAwaiting } from "@/lib/queries/corrections";
import { countPendingByAssignment } from "@/lib/queries/results";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Results" };

const STATUS = {
  scheduled: "bg-warning-soft text-warning-foreground",
  open: "bg-success-soft text-success-foreground",
  closed: "bg-muted text-muted-foreground",
} as const;

/** Results per assignment, plus the manual grading queue. */
export default async function ResultsPage() {
  const session = await requireTeacher();
  const [assignments, pending, corrections] = await Promise.all([
    listTeacherAssignments(session.userId),
    countPendingByAssignment(session.userId),
    countCorrectionsAwaiting(session.userId),
  ]);
  const totalPending = [...pending.values()].reduce((a, b) => a + b, 0);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl">Results</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every attempt, with the highest score counting. Pick an assignment.
          </p>
        </div>
        <Button
          variant={corrections > 0 ? "default" : "outline"}
          nativeButton={false}
          render={<Link href="/app/results/corrections" />}
        >
          <MessageSquareText data-icon="inline-start" aria-hidden />
          Corrections{corrections > 0 ? ` · ${corrections}` : ""}
        </Button>
        <Button
          variant={totalPending > 0 ? "default" : "outline"}
          nativeButton={false}
          render={<Link href="/app/results/grading" />}
        >
          <ClipboardCheck data-icon="inline-start" aria-hidden />
          Grading queue{totalPending > 0 ? ` · ${totalPending}` : ""}
        </Button>
      </div>
      {assignments.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={BarChart3}
            title="No results yet"
            description="Assign an assessment to a class; attempts show up here as students submit."
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assignments.map((a) => {
            const n = pending.get(a.id) ?? 0;
            return (
              <li key={a.id}>
                <Link
                  href={`/app/results/${a.id}`}
                  className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors outline-none hover:border-brand/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base leading-tight">{a.assessmentTitle}</h2>
                    <Badge className={STATUS[a.status]}>{a.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{a.className}</p>
                  <p className="mt-auto flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular">
                    <span>
                      {a.submitted} of {a.enrolled} submitted · {a.started - a.submitted} in
                      progress
                    </span>
                    {n > 0 ? (
                      <span className="font-medium text-warning-foreground">{n} to grade</span>
                    ) : null}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
