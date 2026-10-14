import Link from "next/link";
import { Clock, Lock } from "lucide-react";
import type { StudentAssignment } from "@/lib/queries/assignments";
import { practiceOwed, targetList } from "@/lib/quiz-practice";
import { correctionsWhy, retakeGoal, TYPE_LABEL } from "@/lib/student-home";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { RequestRetakeButton } from "./assignments/[assignmentId]/request-retake-button";
import { RetakePicker } from "./retake-picker";

const PILL: Record<StudentAssignment["state"], { label: string; className: string }> = {
  upcoming: { label: "Opens soon", className: "bg-muted text-muted-foreground" },
  not_started: { label: "Not started", className: "bg-warning-soft text-warning-foreground" },
  in_progress: { label: "In progress", className: "bg-brand-soft text-brand-deep" },
  // Jon, Oct 14 2026: written answers not graded yet; no partial score, no retake until then.
  awaiting_grade: { label: "Waiting for your grade", className: "bg-muted text-muted-foreground" },
  // Jon, Oct 13 2026: at or above the threshold the student is directed here, not told it's optional.
  corrections_to_full: {
    label: "Do corrections → 100%",
    className: "bg-brand-soft text-brand-deep",
  },
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
  relearning: { label: "Relearning in progress", className: "bg-brand-soft text-brand-deep" },
  retake_required: { label: "Retake required", className: "bg-coral-soft text-[#B93E27]" },
  retake_available: { label: "Retake available", className: "bg-brand-soft text-brand-deep" },
  awaiting_unlock: { label: "Waiting for teacher", className: "bg-muted text-muted-foreground" },
  // Jon, Oct 14 2026 (R6): a closed test the student may still ask to retake.
  ask_to_retake: { label: "Ask to retake", className: "bg-brand-soft text-brand-deep" },
  done: { label: "Done for now", className: "bg-success-soft text-success-foreground" },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
};

/** One assignment on the student home (PLAN.md §5 screen 2): status pill and a single action. */
export function AssignmentCard({ a }: { a: StudentAssignment }) {
  const pill = PILL[a.state];
  const c = a.corrections;
  const correcting =
    a.state === "corrections_needed" ||
    a.state === "corrections_to_full" ||
    a.state === "corrections_returned" ||
    a.state === "corrections_submitted";
  // Jon, Oct 8 2026: a set the student has started but not finished says so.
  const correctionsStarted =
    (a.state === "corrections_needed" || a.state === "corrections_to_full") && !!c && c.started > 0;
  // Already off in a CVTC course (Jon, Oct 13 2026).
  const capped = a.type === "formative" && a.correctionsCap;
  const windowOpen = a.retakeBy !== null && !a.retakeWindowClosed;
  const pillLabel = correctionsStarted
    ? "Corrections in progress"
    : a.state === "in_progress" && a.paused
      ? "Paused"
      : pill.label;
  const href =
    correcting && c ? `/student/corrections/${c.attemptId}` : `/student/assignments/${a.id}`;
  // "Ask to retake" and "Ask for a retake" send the request from the card (Jon, Oct 14 2026, R4).
  const asks = a.state === "ask_to_retake" || (a.state === "awaiting_unlock" && !a.retakeRequested);
  const action: { label: string; primary: boolean } | null = (() => {
    switch (a.state) {
      case "not_started":
        return { label: "Start", primary: true };
      case "in_progress":
        return { label: a.paused ? "Finish in class" : "Continue", primary: true };
      case "corrections_needed":
        return {
          label: correctionsStarted ? "Continue corrections" : "Do corrections",
          primary: true,
        };
      case "corrections_to_full":
        return {
          label: correctionsStarted ? "Continue corrections" : "Do corrections",
          primary: true,
        };
      case "corrections_returned":
        return { label: "Revise corrections", primary: true };
      case "corrections_submitted":
        return { label: "View corrections", primary: false };
      case "relearning":
        // A quiz has no checklist: its missed targets need practice (Jon, Oct 14 2026).
        return { label: a.retake ? "View checklist" : "What to practice", primary: false };
      case "retake_required":
      case "retake_available":
        return { label: "Start retake", primary: a.state === "retake_required" };
      case "awaiting_unlock":
        return a.retakeRequested
          ? { label: "View", primary: false }
          : { label: "Ask for a retake", primary: true };
      case "ask_to_retake":
        return { label: "Ask to retake", primary: a.askCounts };
      case "awaiting_grade":
      case "done":
      case "closed":
        return { label: "View", primary: false };
      default:
        return null;
    }
  })();
  const allProficient = a.type === "summative" && a.retake && a.retake.plan.required.length === 0;
  const owedPractice = practiceOwed(a.quizPractice);

  return (
    <li
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4"
      data-assignment={a.id}
      data-state={a.state}
    >
      <div className="mr-auto min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-medium">{a.title}</h3>
          <span
            className="rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
            data-type={a.type}
          >
            {TYPE_LABEL[a.type]}
          </span>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${pill.className}`}
            data-pill={correctionsStarted ? "corrections_in_progress" : a.state}
          >
            {pillLabel}
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
          ) : a.reopenedUntil ? (
            <span data-reopened>
              Reopened for you until <LocalTime date={a.reopenedUntil} />
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
          {a.state === "in_progress" && a.progress && a.progress.total > 0 ? (
            <span className="inline-flex items-center gap-1.5 tabular" data-progress>
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span
                  className="block h-full bg-brand"
                  style={{ width: `${(a.progress.answered / a.progress.total) * 100}%` }}
                />
              </span>
              {a.progress.answered} of {a.progress.total} answered
            </span>
          ) : null}
          {a.nextAttemptAt ? (
            <span>
              Next attempt <LocalTime date={a.nextAttemptAt} />
            </span>
          ) : null}
          {a.state === "awaiting_unlock" ? (
            <span className="inline-flex items-center gap-1" data-unlock-hint>
              <Lock className="size-3.5" aria-hidden />
              {a.retakeRequested && a.status === "closed"
                ? "Retake requested"
                : a.retakeRequested
                  ? `Attempt ${a.attemptsUsed + 1} requested`
                  : `Your teacher unlocks attempt ${a.attemptsUsed + 1}`}
            </span>
          ) : null}
          {a.state === "awaiting_grade" ? null : a.final && a.resultsReleased && capped ? (
            <span className="tabular" data-final={a.final.basis ?? "none"}>
              {a.final.basis === "best_attempt" ? "Best" : "Score"} {Math.round(a.final.percent)}%
              {a.final.basis === "corrections_to_threshold"
                ? " · after corrections, your top score until you retake"
                : a.final.basis === "corrections_to_full"
                  ? " · after corrections"
                  : a.final.basis === "retake"
                    ? " · from your retake"
                    : ""}
            </span>
          ) : a.bestPercent !== null && a.resultsReleased ? (
            <span className="tabular">
              Best {Math.round(a.bestPercent)}%{allProficient ? " · all targets proficient" : ""}
            </span>
          ) : null}
          {a.retakeBy &&
          a.state !== "in_progress" &&
          a.state !== "awaiting_grade" &&
          a.attemptsUsed > 0 ? (
            windowOpen ? (
              a.state === "done" ? null : (
                <span data-retake-window>
                  Retake by <LocalTime date={a.retakeBy} />
                </span>
              )
            ) : (
              <span data-retake-window="closed">
                Retakes closed <LocalTime date={a.retakeBy} />
              </span>
            )
          ) : null}
          {c && (a.state === "corrections_needed" || a.state === "corrections_to_full") ? (
            // The rule's words, as on the to-do list (Jon, Oct 14 2026).
            <span className="inline-flex items-center gap-1" data-corrections-hint>
              {a.state === "corrections_needed" ? <Lock className="size-3.5" aria-hidden /> : null}
              {correctionsWhy(a)}
              {correctionsStarted ? ` ${c.started} of ${c.needed} done.` : ""}
            </span>
          ) : a.cycle === "relearning" && owedPractice.length ? (
            // On a closed quiz the practice comes before asking to retake (R3, R4).
            <span className="inline-flex items-center gap-1" data-practice-hint>
              <Lock className="size-3.5" aria-hidden />
              Practice {targetList(owedPractice.map((t) => t.code))} {retakeGoal(a)}
            </span>
          ) : c && a.state === "corrections_returned" ? (
            <span data-corrections-hint>Your teacher sent your corrections back with a note</span>
          ) : c && a.state === "corrections_submitted" ? (
            <span data-corrections-hint>Awaiting your teacher&apos;s approval</span>
          ) : null}
        </p>
        {a.retake &&
        (a.state === "retake_required" ||
          a.state === "retake_available" ||
          a.state === "relearning") ? (
          <div className="mt-2">
            <RetakePicker
              assignmentId={a.id}
              retake={a.retake}
              checklist={a.state === "relearning"}
              compact
            />
          </div>
        ) : null}
      </div>
      {action && asks ? (
        <RequestRetakeButton
          assignmentId={a.id}
          attemptNumber={a.attemptsUsed + 1}
          label={action.label}
          primary={action.primary}
          title={a.title}
          block
        />
      ) : action ? (
        <Button
          size="lg"
          variant={action.primary ? "default" : "outline"}
          className="h-11 w-full sm:h-9 sm:w-auto"
          aria-label={`${action.label}: ${a.title}`}
          nativeButton={false}
          render={<Link href={href} />}
        >
          {action.label}
        </Button>
      ) : null}
    </li>
  );
}
