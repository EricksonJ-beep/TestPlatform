import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, LayoutGrid } from "lucide-react";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { getAssignmentRow } from "@/lib/queries/assignments";
import { getCorrectionsProgress } from "@/lib/queries/corrections";
import { getGradebook, getItemAnalysis, getMasteryGrid } from "@/lib/queries/results";
import { classAverages } from "@/lib/mastery";
import { CorrectionsBar, CorrectionsSummary } from "./corrections-progress";
import { StudentResultsTable } from "./student-table";
import { HardQuestions, MasteryHeatmap } from "./mastery-grid";
import { RegradeButton } from "./regrade-button";
import { Button } from "@/components/ui/button";
import { FollowCourse } from "@/components/app/course-focus";

export const metadata: Metadata = { title: "Results" };

/** Results for one assignment: heatmap, one row per student (attempts, corrections, counting score), hard questions. */
export default async function AssignmentResultsPage({
  params,
}: PageProps<"/app/results/[assignmentId]">) {
  const { assignmentId } = await params;
  try {
    await requireOwner({ type: "assignment", id: assignmentId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const a = await getAssignmentRow(assignmentId);
  if (!a) notFound();
  const [rows, grid, items, corrections] = await Promise.all([
    getGradebook(assignmentId),
    getMasteryGrid(assignmentId),
    getItemAnalysis(assignmentId),
    a.assessmentType === "practice" ? null : getCorrectionsProgress(assignmentId),
  ]);
  const pending = rows.reduce((n, r) => n + r.attempts.reduce((m, t) => m + t.pendingManual, 0), 0);
  const summative = a.assessmentType === "summative";
  const classAverage = classAverages(
    grid.targets.map((t) => t.id),
    grid.rows
  ).overall;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <FollowCourse courseId={a.courseId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <Link
            href="/app/results"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden /> Results
          </Link>
          <h1 className="mt-2 text-2xl">{a.assessmentTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {a.className} · {a.submitted} of {a.enrolled} submitted · highest counts
            {summative ? " per target" : ""}
            {pending > 0
              ? ` · ${pending} ${pending === 1 ? "response" : "responses"} to grade`
              : ""}
            {classAverage ? ` · class average ${Math.round(classAverage.average)}%` : ""}
          </p>
        </div>
        {pending > 0 ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/app/results/grading" />}
          >
            Grade {pending}
          </Button>
        ) : null}
        {summative ? (
          <Button
            nativeButton={false}
            render={<Link href={`/app/results/${assignmentId}/tiers`} />}
          >
            <LayoutGrid data-icon="inline-start" aria-hidden />
            Tier board
          </Button>
        ) : null}
        <RegradeButton
          assignmentId={assignmentId}
          attempts={rows.reduce((n, r) => n + r.attempts.length, 0)}
        />
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={`/api/results/${assignmentId}/export`} />}
        >
          <Download data-icon="inline-start" aria-hidden />
          Export CSV
        </Button>
      </div>

      {grid.targets.length > 0 ? <MasteryHeatmap grid={grid} /> : null}

      <section className="flex flex-col gap-3" aria-labelledby="students-heading">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 id="students-heading" className="text-lg">
            Students
          </h2>
          {corrections ? (
            <CorrectionsSummary progress={corrections} reviewMode={a.reviewMode} />
          ) : null}
        </div>
        {corrections ? <CorrectionsBar progress={corrections} /> : null}
        <StudentResultsTable
          assignmentId={assignmentId}
          rows={rows}
          corrections={corrections?.rows ?? null}
          summative={summative}
          retakesNeedUnlock={a.retakesNeedUnlock}
          attemptsAllowed={a.attemptsAllowed}
        />
      </section>

      <HardQuestions items={items} assignmentId={assignmentId} />
    </div>
  );
}
