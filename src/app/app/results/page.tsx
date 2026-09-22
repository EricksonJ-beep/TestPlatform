import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { listTeacherAssignments } from "@/lib/queries/assignments";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Results" };

const STATUS = {
  scheduled: "bg-warning-soft text-warning-foreground",
  open: "bg-success-soft text-success-foreground",
  closed: "bg-muted text-muted-foreground",
} as const;

/** Results per assignment. Ticket 1.10 grows this into the gradebook, manual grading, and export. */
export default async function ResultsPage() {
  const session = await requireTeacher();
  const assignments = await listTeacherAssignments(session.userId);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-2xl">Results</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every attempt, with the highest score counting. Pick an assignment.
        </p>
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
          {assignments.map((a) => (
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
                <p className="mt-auto text-xs text-muted-foreground tabular">
                  {a.submitted} of {a.enrolled} submitted · {a.started - a.submitted} in progress
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
