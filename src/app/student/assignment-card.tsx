import Link from "next/link";
import { Clock, Lock } from "lucide-react";
import type { StudentAssignment } from "@/lib/queries/assignments";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";

const PILL: Record<StudentAssignment["state"], { label: string; className: string }> = {
  upcoming: { label: "Opens soon", className: "bg-muted text-muted-foreground" },
  not_started: { label: "Not started", className: "bg-warning-soft text-warning-foreground" },
  in_progress: { label: "In progress", className: "bg-brand-soft text-brand-deep" },
  corrections_needed: {
    label: "Corrections needed",
    className: "bg-coral-soft text-[#B93E27]",
  },
  corrections_returned: {
    label: "Corrections returned",
    className: "bg-warning-soft text-warning-foreground",
  },
  corrections_submitted: {
    label: "Corrections submitted",
    className: "bg-brand-soft text-brand-deep",
  },
  done: { label: "Done for now", className: "bg-success-soft text-success-foreground" },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
};

/** One assignment on the student home (PLAN.md §5 screen 2): status pill and a single action. */
export function AssignmentCard({ a }: { a: StudentAssignment }) {
  const pill = PILL[a.state];
  const c = a.corrections;
  const correcting =
    a.state === "corrections_needed" ||
    a.state === "corrections_returned" ||
    a.state === "corrections_submitted";
  const href =
    correcting && c ? `/student/corrections/${c.attemptId}` : `/student/assignments/${a.id}`;
  const nextAttempt = a.attemptsAllowed === null || a.attemptsUsed < a.attemptsAllowed;
  const action =
    a.state === "not_started"
      ? { label: "Start", primary: true }
      : a.state === "in_progress"
        ? { label: "Continue", primary: true }
        : a.state === "corrections_needed"
          ? { label: "Do corrections", primary: true }
          : a.state === "corrections_returned"
            ? { label: "Revise corrections", primary: true }
            : a.state === "corrections_submitted"
              ? { label: "View corrections", primary: false }
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
          {a.nextAttemptAt ? (
            <span>
              Next attempt <LocalTime date={a.nextAttemptAt} />
            </span>
          ) : null}
          {c && a.state === "corrections_needed" ? (
            <span className="inline-flex items-center gap-1" data-corrections-hint>
              <Lock className="size-3.5" aria-hidden />
              Correct {c.remaining} missed {c.remaining === 1 ? "question" : "questions"}
              {nextAttempt ? ` to unlock attempt ${a.attemptsUsed + 1}` : ""}
            </span>
          ) : c && a.state === "corrections_returned" ? (
            <span data-corrections-hint>Your teacher sent your corrections back with a note</span>
          ) : c && a.state === "corrections_submitted" ? (
            <span data-corrections-hint>Awaiting your teacher&apos;s approval</span>
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
