import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, X } from "lucide-react";
import { cn } from "cn";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { getRelearningMonitor } from "@/lib/queries/tiers";
import { LocalTime } from "@/components/local-time";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Relearning monitor" };

function Mark({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="inline size-4 text-success-foreground" aria-label="done" />
  ) : (
    <X className="inline size-4 text-muted-foreground" aria-label="not yet" />
  );
}

/**
 * The relearning monitor (PLAN.md §3.11): everything one student has done
 * since attempt 1, per target, with a readiness line summarizing the gates.
 */
export default async function RelearningMonitorPage({
  params,
}: PageProps<"/app/results/[assignmentId]/students/[studentId]">) {
  const { assignmentId, studentId } = await params;
  try {
    await requireOwner({ type: "assignment", id: assignmentId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const m = await getRelearningMonitor(assignmentId, studentId);
  if (!m) notFound();
  const tierTone =
    m.tier === 1
      ? "bg-success-soft text-success-foreground"
      : m.tier === 2
        ? "bg-warning-soft text-warning-foreground"
        : m.tier === 3
          ? "bg-coral-soft text-[#B93E27]"
          : "bg-muted text-muted-foreground";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5" data-monitor={studentId}>
      <div>
        <Link
          href={`/app/results/${assignmentId}/tiers`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> Tier board
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl">
            {m.student.lastName}, {m.student.firstName}
          </h1>
          <span className={cn("rounded-md px-2 py-0.5 text-sm font-medium", tierTone)}>
            {m.tier ? `Tier ${m.tier}` : "Not scored"}
          </span>
          <span className="text-sm text-muted-foreground">{m.stageLabel}</span>
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted-foreground tabular">
          <span>
            {m.assignment.title} · {m.assignment.className}
          </span>
          {m.percent !== null ? <span>Overall {Math.round(m.percent)}%</span> : null}
          <span>{m.minutesOnTask} min on task</span>
          {m.latestAttemptId ? (
            <Link
              href={`/app/results/attempts/${m.latestAttemptId}`}
              className="font-medium text-brand-deep hover:underline"
            >
              Review latest attempt
            </Link>
          ) : null}
        </p>
      </div>

      <section className="rounded-lg border border-border bg-card" aria-label="Readiness">
        <h2 className="border-b border-border px-4 py-2 text-sm font-medium">Readiness</h2>
        <ul className="divide-y divide-border text-sm">
          {m.targets.map((t) => (
            <li key={t.id} className="px-4 py-2 tabular" data-readiness-line={t.code}>
              <span
                className={cn(
                  "mr-2 rounded-md px-1.5 py-0.5 text-xs font-medium",
                  t.state === "ready"
                    ? "bg-success-soft text-success-foreground"
                    : t.state === "not_ready"
                      ? "bg-coral-soft text-[#B93E27]"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {t.state.replace("_", " ")}
              </span>
              {t.line}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {m.targets.map((t) => (
          <section
            key={t.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-sm"
            data-monitor-target={t.code}
          >
            <div className="flex flex-wrap items-center gap-2">
              <TargetChip
                code={t.code}
                title={t.title}
                percent={t.percent}
                tone={t.required ? "required" : t.optedIn ? "optional" : "default"}
              />
              <span className="ml-auto text-xs text-muted-foreground tabular">
                attempt 1: {t.attempt1Percent === null ? "—" : `${Math.round(t.attempt1Percent)}%`}
                {t.retaken ? ` · retaken → ${Math.round(t.percent)}%` : ""}
              </span>
            </div>
            <dl className="grid gap-1">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Corrections</dt>
                <dd>
                  <Mark ok={t.gate.correctionsOk} />{" "}
                  {t.corrections
                    ? `${t.corrections.approved} approved · ${t.corrections.submitted} submitted · ${t.corrections.returned} returned of ${t.corrections.needed}`
                    : "nothing missed"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Activity</dt>
                <dd>
                  <Mark ok={t.gate.activityOk} />{" "}
                  {t.activities.length === 0 ? (
                    <span className="text-muted-foreground">none published</span>
                  ) : (
                    t.activities.map((a) => (
                      <span key={a.id} className="mr-2">
                        {a.title}
                        <span className="text-muted-foreground">
                          {a.completedAt ? (
                            <>
                              {" · done "}
                              <LocalTime date={a.completedAt} />
                              {a.requiresTeacherVerification && !a.teacherVerified
                                ? " · not verified"
                                : ""}
                            </>
                          ) : (
                            " · not started"
                          )}
                        </span>
                      </span>
                    ))
                  )}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Practice</dt>
                <dd>
                  <Mark ok={t.gate.practiceOk} />{" "}
                  {t.practice.length === 0 ? (
                    <span className="text-muted-foreground">none published</span>
                  ) : (
                    t.practice.map((p) => (
                      <span key={p.id} className="mr-2">
                        {p.title}
                        <span className="text-muted-foreground tabular">
                          {p.attempts === 0
                            ? " · not tried"
                            : ` · ${p.attempts} ${p.attempts === 1 ? "try" : "tries"}${p.bestPercent !== null ? ` · best ${Math.round(p.bestPercent)}%` : ""}${p.completed ? "" : " · not finished"}`}
                          {p.lastActive ? (
                            <>
                              {" · "}
                              <LocalTime date={p.lastActive} />
                            </>
                          ) : null}
                        </span>
                      </span>
                    ))
                  )}
                </dd>
              </div>
            </dl>
          </section>
        ))}
      </div>

      <section className="rounded-lg border border-border bg-card" aria-label="Attempts">
        <h2 className="border-b border-border px-4 py-2 text-sm font-medium">Attempts</h2>
        {m.attempts.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">No attempt yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {m.attempts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <span className="font-medium">
                  Attempt {a.number}
                  {a.scopeCodes ? ` · retake ${a.scopeCodes.join(", ")}` : ""}
                </span>
                <span className="text-muted-foreground tabular">
                  {a.status === "in_progress" ? "in progress" : `${Math.round(a.percent ?? 0)}%`}
                  {a.minutes !== null ? ` · ${a.minutes} min` : ""}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  <LocalTime date={a.submittedAt ?? a.startedAt} />
                </span>
                {a.status !== "in_progress" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href={`/app/results/attempts/${a.id}`} />}
                  >
                    Review
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
