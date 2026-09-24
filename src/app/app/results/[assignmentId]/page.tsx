import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { getAssignmentRow } from "@/lib/queries/assignments";
import { getGradebook } from "@/lib/queries/results";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Results" };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Gradebook: students × attempts, the highest in bold, corrections status, finish time. */
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
  const rows = await getGradebook(assignmentId);
  const pending = rows.reduce((n, r) => n + r.attempts.reduce((m, t) => m + t.pendingManual, 0), 0);
  const summative = a.assessmentType === "summative";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
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
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={`/api/results/${assignmentId}/export`} />}
        >
          <Download data-icon="inline-start" aria-hidden />
          Export CSV
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead className="hidden md:table-cell">Corrections</TableHead>
              <TableHead className="text-right">Counts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.studentId} data-student={s.studentId}>
                <TableCell className="align-top font-medium">
                  {s.lastName}, {s.firstName}
                </TableCell>
                <TableCell className="align-top">
                  {s.attempts.length === 0 ? (
                    <span className="text-muted-foreground">Not started</span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {s.attempts.map((t) => {
                        const best = t.id === s.bestAttemptId;
                        return (
                          <li
                            key={t.id}
                            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"
                            data-attempt={t.number}
                          >
                            <span className={best ? "font-semibold" : ""}>Attempt {t.number}</span>
                            {t.status === "in_progress" ? (
                              <Badge className="bg-brand-soft text-brand-deep">In progress</Badge>
                            ) : (
                              <>
                                <span className={`tabular ${best ? "font-semibold" : ""}`}>
                                  {t.score !== null && t.maxScore !== null
                                    ? `${fmt(t.score)} / ${fmt(t.maxScore)} · ${Math.round(t.percent ?? 0)}%`
                                    : "—"}
                                </span>
                                {t.pendingManual > 0 ? (
                                  <Badge className="bg-warning-soft text-warning-foreground">
                                    {t.pendingManual} to grade
                                  </Badge>
                                ) : null}
                                <span className="text-xs text-muted-foreground">
                                  {t.submittedAt ? <LocalTime date={t.submittedAt} /> : null}
                                  {t.tabSwitches > 0
                                    ? ` · ${t.tabSwitches} tab ${t.tabSwitches === 1 ? "switch" : "switches"}`
                                    : ""}
                                </span>
                              </>
                            )}
                            {t.status !== "in_progress" ? (
                              <Link
                                href={`/app/results/attempts/${t.id}`}
                                className="text-xs font-medium text-brand-deep hover:underline"
                              >
                                Review
                              </Link>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </TableCell>
                <TableCell className="hidden align-top text-sm text-muted-foreground md:table-cell">
                  {(() => {
                    const latest = [...s.attempts].reverse().find((t) => t.corrections);
                    const c = latest?.corrections;
                    if (!latest || !c) return "—";
                    const label =
                      c.state === "submitted"
                        ? "Awaiting approval"
                        : c.state === "returned"
                          ? "Returned"
                          : c.state === "approved"
                            ? "Approved"
                            : "In progress";
                    return (
                      <span data-corrections-status>
                        {label}
                        <span className="block text-xs">
                          attempt {latest.number} · {c.approved}/{c.total} approved
                        </span>
                      </span>
                    );
                  })()}
                </TableCell>
                <TableCell className="text-right align-top font-semibold tabular">
                  {s.final ? (
                    <>
                      {fmt(s.final.totalEarned)} / {fmt(s.final.totalPossible)} ·{" "}
                      {Math.round(s.final.percent)}%
                      {summative && s.final.tier ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          Tier {s.final.tier} · {s.final.targetsBelowThreshold} below threshold
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
