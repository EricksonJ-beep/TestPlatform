import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { getAssignmentRow } from "@/lib/queries/assignments";
import { listAssignmentAttempts, listFinalScores } from "@/lib/queries/attempts";
import { getClassDetail } from "@/lib/queries/classes";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Results" };

/** Students × attempts for one assignment, with the score that counts. */
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
  const [attempts, finals, cls] = await Promise.all([
    listAssignmentAttempts(assignmentId),
    listFinalScores(assignmentId),
    getClassDetail(a.classId),
  ]);
  const finalBy = new Map(finals.map((f) => [f.studentId, f]));
  const attemptsBy = new Map<string, typeof attempts>();
  for (const t of attempts)
    (attemptsBy.get(t.studentId) ?? attemptsBy.set(t.studentId, []).get(t.studentId)!).push(t);
  const roster = cls?.roster ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <Link
          href="/app/results"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> Results
        </Link>
        <h1 className="mt-2 text-2xl">{a.assessmentTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground tabular">
          {a.className} · {a.submitted} of {a.enrolled} submitted · highest counts
          {a.assessmentType === "summative" ? " per target" : ""}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Attempt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Submitted</TableHead>
              <TableHead className="hidden text-right md:table-cell">Tab switches</TableHead>
              <TableHead className="text-right">Counts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roster.map((s) => {
              const rows = attemptsBy.get(s.studentId) ?? [];
              const final = finalBy.get(s.studentId);
              if (rows.length === 0) {
                return (
                  <TableRow key={s.studentId} data-student={s.studentId}>
                    <TableCell className="font-medium">
                      {s.lastName}, {s.firstName}
                    </TableCell>
                    <TableCell className="text-muted-foreground" colSpan={5}>
                      Not started
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">—</TableCell>
                  </TableRow>
                );
              }
              return rows.map((t, i) => (
                <TableRow key={t.id} data-student={s.studentId} data-attempt={t.number}>
                  <TableCell className="font-medium">
                    {i === 0 ? `${s.lastName}, ${s.firstName}` : ""}
                  </TableCell>
                  <TableCell className="tabular">{t.number}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        t.status === "graded"
                          ? "bg-success-soft text-success-foreground"
                          : t.status === "submitted"
                            ? "bg-warning-soft text-warning-foreground"
                            : "bg-brand-soft text-brand-deep"
                      }
                    >
                      {t.status === "graded"
                        ? "Graded"
                        : t.status === "submitted"
                          ? "Needs grading"
                          : "In progress"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {t.score !== null && t.maxScore !== null
                      ? `${t.score} / ${t.maxScore} · ${Math.round(t.percent ?? 0)}%`
                      : "—"}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                    {t.submittedAt ? (
                      <LocalTime date={t.submittedAt} />
                    ) : (
                      <LocalTime date={t.startedAt} />
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground tabular md:table-cell">
                    {t.tabSwitches}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular">
                    {i === 0 && final
                      ? `${final.totalEarned} / ${final.totalPossible} · ${Math.round(final.percent)}%`
                      : ""}
                  </TableCell>
                </TableRow>
              ));
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
