import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, ClipboardCheck, MessageSquareText, RefreshCw } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { splitByCourse } from "@/lib/course-focus";
import { getCurrentCourse } from "@/lib/current-course";
import { listTeacherAssignments } from "@/lib/queries/assignments";
import {
  countCorrectionsAwaiting,
  countCorrectionsAwaitingByAssignment,
} from "@/lib/queries/corrections";
import { listPausedAttempts } from "@/lib/queries/dashboard";
import { countPendingByAssignment, getResultsOverview } from "@/lib/queries/results";
import { countSkywardUpdates } from "@/lib/queries/skyward-updates";
import type { ResultsRow } from "@/lib/results-table";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ResultsTable } from "./results-table";

export const metadata: Metadata = { title: "Results" };

/**
 * Results per assignment as one sortable table (Jon, Nov 5 2026: "sort the assessment on the
 * result page … more in a table so they are organized and more compact"), plus the grading and
 * corrections queues.
 */
export default async function ResultsPage() {
  const session = await requireTeacher();
  const now = new Date();
  const [
    allAssignments,
    pending,
    correctionsTotal,
    awaitingBy,
    overview,
    paused,
    { current },
    skyward,
  ] = await Promise.all([
    listTeacherAssignments(session.userId, now),
    countPendingByAssignment(session.userId),
    countCorrectionsAwaiting(session.userId),
    countCorrectionsAwaitingByAssignment(session.userId),
    getResultsOverview(session.userId),
    listPausedAttempts(session.userId, now),
    getCurrentCourse(session.userId),
    countSkywardUpdates(session.userId),
  ]);
  // Course focus (docs/course-focus-plan.md): this course's assignments (plus any whose
  // assessment has no course); the queue counts follow, with what waits elsewhere noted.
  const split = splitByCourse(allAssignments, current);
  const assignments = [...split.mine, ...split.orphans];
  const sum = (m: Map<string, number>, rows: { id: string }[]) =>
    rows.reduce((n, a) => n + (m.get(a.id) ?? 0), 0);
  const totalPending = sum(pending, assignments);
  const corrections = sum(awaitingBy, assignments);
  const pendingElsewhere = [...pending.values()].reduce((a, b) => a + b, 0) - totalPending;
  const correctionsElsewhere = correctionsTotal - corrections;
  // "Ask my teacher" on a paused test, counted as the Dashboard counts it.
  const asks = new Map<string, number>();
  for (const p of paused)
    if (p.askedAt) asks.set(p.assignmentId, (asks.get(p.assignmentId) ?? 0) + 1);
  const rows: ResultsRow[] = assignments.map((a) => {
    const o = overview.get(a.id);
    return {
      id: a.id,
      title: a.assessmentTitle,
      type: a.assessmentType,
      className: a.className,
      period: o?.period ?? null,
      unitName: o?.unitName ?? null,
      unitOrder: o?.unitOrder ?? null,
      status: a.status,
      opensAt: a.opensAt,
      closesAt: a.closesAt,
      createdAt: a.createdAt,
      enrolled: a.enrolled,
      submitted: a.submitted,
      inProgress: a.started - a.submitted,
      average: o?.average ?? null,
      median: o?.median ?? null,
      scored: o?.scored ?? 0,
      toGrade: pending.get(a.id) ?? 0,
      corrections: awaitingBy.get(a.id) ?? 0,
      requests: o?.requests ?? 0,
      asks: asks.get(a.id) ?? 0,
    };
  });
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl">Results</h1>
          <p className="mt-1 text-sm text-muted-foreground">Highest score counts per student.</p>
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
        <Button
          variant={skyward > 0 ? "default" : "outline"}
          nativeButton={false}
          render={<Link href="/app/skyward" />}
        >
          <RefreshCw data-icon="inline-start" aria-hidden />
          Skyward updates{skyward > 0 ? ` · ${skyward}` : ""}
        </Button>
      </div>
      {pendingElsewhere > 0 || correctionsElsewhere > 0 ? (
        <p className="text-xs text-muted-foreground" data-elsewhere>
          Also waiting in other courses:{" "}
          {[
            pendingElsewhere > 0 ? `${pendingElsewhere} to grade` : null,
            correctionsElsewhere > 0
              ? `${correctionsElsewhere} ${correctionsElsewhere === 1 ? "correction set" : "correction sets"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          . Switch course in the sidebar to see them.
        </p>
      ) : null}
      {assignments.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={BarChart3}
            title={current ? `No results in ${current.name} yet` : "No results yet"}
            description="Assign an assessment to a class; attempts show up here as students submit."
          />
        </div>
      ) : (
        <ResultsTable rows={rows} now={now.getTime()} />
      )}
      {split.elsewhere > 0 ? (
        <p className="text-xs text-muted-foreground" data-elsewhere>
          {split.elsewhere} {split.elsewhere === 1 ? "assignment" : "assignments"} in other courses.
          Switch course in the sidebar to see them.
        </p>
      ) : null}
    </div>
  );
}
