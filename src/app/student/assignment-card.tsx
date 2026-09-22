import Link from "next/link";
import { Clock, Lock } from "lucide-react";
import type { StudentAssignment } from "@/lib/queries/assignments";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";

const PILL: Record<StudentAssignment["state"], { label: string; className: string }> = {
  upcoming: { label: "Opens soon", className: "bg-muted text-muted-foreground" },
  not_started: { label: "Not started", className: "bg-warning-soft text-warning-foreground" },
  in_progress: { label: "In progress", className: "bg-brand-soft text-brand-deep" },
  done: { label: "Done for now", className: "bg-success-soft text-success-foreground" },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
};

/** One assignment on the student home (PLAN.md §5 screen 2): status pill and a single action. */
export function AssignmentCard({ a }: { a: StudentAssignment }) {
  const pill = PILL[a.state];
  const href = `/student/assignments/${a.id}`;
  const action =
    a.state === "not_started"
      ? { label: "Start", primary: true }
      : a.state === "in_progress"
        ? { label: "Continue", primary: true }
        : a.state === "done" || a.state === "closed"
          ? { label: "View", primary: false }
          : null;

  return (
    <li
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4"
      data-assignment={a.id}
    >
      <div className="mr-auto min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-medium">{a.title}</h3>
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${pill.className}`}>
            {pill.label}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            {a.className} · {a.teacherLastName}
          </span>
          {a.state === "upcoming" && a.opensAt ? (
            <span>
              Opens <LocalTime date={a.opensAt} />
            </span>
          ) : a.closesAt ? (
            <span>
              Due <LocalTime date={a.closesAt} />
            </span>
          ) : null}
          {a.timeLimitMinutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {a.timeLimitMinutes} min
            </span>
          ) : null}
          {a.needsCode ? (
            <span className="inline-flex items-center gap-1">
              <Lock className="size-3.5" aria-hidden />
              Code required
            </span>
          ) : null}
          {a.attemptsAllowed !== null ? (
            <span className="tabular">
              {a.attemptsUsed} of {a.attemptsAllowed}{" "}
              {a.attemptsAllowed === 1 ? "attempt" : "attempts"} used
            </span>
          ) : null}
          {a.bestPercent !== null && a.resultsReleased ? (
            <span className="tabular">Best {Math.round(a.bestPercent)}%</span>
          ) : null}
        </p>
      </div>
      {action ? (
        <Button
          size="lg"
          variant={action.primary ? "default" : "outline"}
          nativeButton={false}
          render={<Link href={href} />}
        >
          {action.label}
        </Button>
      ) : null}
    </li>
  );
}
