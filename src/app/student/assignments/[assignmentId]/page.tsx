import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, Lock } from "lucide-react";
import { isAuthzError, requireAssignmentAccess, studentCourseIds } from "@/lib/authz";
import { listCustomPracticeOptions } from "@/lib/custom-practice";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { PRACTICE_PASS_PERCENT, practiceOwed, targetList } from "@/lib/quiz-practice";
import { listStudentAttempts } from "@/lib/queries/attempts";
import { correctionsWhy, retakeGoal } from "@/lib/student-home";
import { LocalTime } from "@/components/local-time";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { RetakePicker } from "../../retake-picker";
import { RequestRetakeButton } from "./request-retake-button";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "Assignment" };

/** The launch pad for one assignment: rules, the access code prompt, retake choices, and past attempts. */
export default async function StudentAssignmentPage({
  params,
}: PageProps<"/student/assignments/[assignmentId]">) {
  const { assignmentId } = await params;
  let access;
  try {
    access = await requireAssignmentAccess(assignmentId);
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  if (access.as !== "student") notFound();
  const a = (await listStudentAssignments(access.userId)).find((x) => x.id === assignmentId);
  if (!a) notFound();
  const attempts = await listStudentAttempts(assignmentId, access.userId);
  const attemptsLeft =
    a.attemptsAllowed === null ? null : Math.max(0, a.attemptsAllowed - a.attemptsUsed);
  const c = a.corrections;
  // Corrections hold the page where the rule says they come first: never in a CVTC course (Oct 13
  // 2026), and with "Retakes need my OK" too (Oct 14 2026); the same rule as the card.
  const correctionsBlock =
    (a.correctionsRule === "gate" || a.correctionsRule === "to_full") &&
    !!c &&
    c.state !== "approved" &&
    c.state !== "none";
  const retaking = a.state === "retake_required" || a.state === "retake_available";
  // On a closed test the cycle goes on toward asking to retake (Jon, Oct 14 2026, R4).
  const closed = a.status === "closed";
  // Quiz relearning (Jon, Oct 14 2026): the missed targets still to practise before a retake.
  const owedPractice = practiceOwed(a.quizPractice);
  // "Practice" opens Build my practice on the first target it can deal; otherwise the Practice tab.
  const buildable = owedPractice.length
    ? new Set(
        (await listCustomPracticeOptions(await studentCourseIds(access.userId))).flatMap((co) =>
          co.units.flatMap((u) => u.targets.map((t) => t.id))
        )
      )
    : new Set<string>();
  const practiceTarget = owedPractice.find((t) => buildable.has(t.targetId));
  const practiceHref = practiceTarget
    ? `/student/practice/build?target=${practiceTarget.targetId}`
    : "/student?tab=practice";
  const attemptsLeftNow = attemptsLeft === null || attemptsLeft > 0;
  // A paused or unfinished test stays reachable after the window closes (Finish later, Oct 13 2026).
  const canStart =
    (a.state === "in_progress" ||
      (a.status === "open" && (a.state === "not_started" || retaking))) &&
    !correctionsBlock;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link
        href="/student"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> Home
      </Link>
      <div>
        <h1 className="text-2xl">{a.title}</h1>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            {a.className} · {a.teacherLastName}
          </span>
          {a.reopenedUntil ? (
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
              {a.timeLimitMinutes} min once you start
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
          {a.retakeBy && a.attemptsUsed > 0 ? (
            <span data-retake-window={a.retakeWindowClosed ? "closed" : "open"}>
              {a.retakeWindowClosed ? "Retakes closed " : "Retake by "}
              <LocalTime date={a.retakeBy} />
            </span>
          ) : null}
        </p>
      </div>

      {a.retake &&
      a.attemptsUsed > 0 &&
      a.state !== "in_progress" &&
      a.state !== "awaiting_grade" ? (
        <section className="rounded-lg border border-border bg-card px-4 py-3" data-retake-panel>
          <h2 className="mb-2 text-sm font-medium">Retake by learning target</h2>
          <RetakePicker
            assignmentId={a.id}
            retake={a.retake}
            checklist={a.cycle === "relearning" || retaking}
          />
        </section>
      ) : null}

      {a.state === "upcoming" ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          This opens <LocalTime date={a.opensAt} />. Check back then.
        </p>
      ) : a.state === "awaiting_grade" ? (
        <p
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm"
          data-awaiting-grade
        >
          <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Waiting for your grade. Your teacher is grading your written answers; your score and
          what&apos;s next show up here once they&apos;re done.
        </p>
      ) : c && correctionsBlock && a.state !== "in_progress" ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
          data-corrections-gate
        >
          <span className="mr-auto inline-flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" aria-hidden />
            {c.state === "submitted"
              ? "Your corrections are in. Your teacher will approve them or send them back."
              : c.state === "returned"
                ? a.correctionsRule === "to_full"
                  ? "Your teacher sent your corrections back. Revise and resubmit to raise this quiz to 100%."
                  : closed && attemptsLeftNow
                    ? "Your teacher sent your corrections back. Revise and resubmit before you can ask to retake."
                    : "Your teacher sent your corrections back. Revise and resubmit to unlock your next attempt."
                : // The to-do list's words (Jon, Oct 14 2026); a retake to go higher only while it's open.
                  `${correctionsWhy(a)}${
                    a.type === "formative" &&
                    a.correctionsCap &&
                    c.attemptNumber === 1 &&
                    a.correctionsRule !== "to_full" &&
                    !closed &&
                    attemptsLeftNow
                      ? " Then retake it to go higher."
                      : ""
                  }${c.started > 0 ? ` ${c.started} of ${c.needed} done.` : ""}`}
          </span>
          <Button
            size="lg"
            variant={c.state === "submitted" ? "outline" : "default"}
            nativeButton={false}
            render={<Link href={`/student/corrections/${c.attemptId}`} />}
          >
            {c.state === "submitted"
              ? "View corrections"
              : c.state === "returned"
                ? "Revise corrections"
                : "Do corrections"}
          </Button>
        </div>
      ) : a.cycle === "relearning" && !a.retake && owedPractice.length ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
          data-practice-gate
        >
          <span className="mr-auto inline-flex items-start gap-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              Practice {targetList(owedPractice.map((t) => t.code))} {retakeGoal(a)}. Score{" "}
              {PRACTICE_PASS_PERCENT}% or better on a practice for{" "}
              {owedPractice.length === 1 ? "it" : "each one"} (Build my practice: pick the target
              and at least 5 questions). You can try as many times as you like.
            </span>
          </span>
          <Button size="lg" nativeButton={false} render={<Link href={practiceHref} />}>
            Practice
          </Button>
        </div>
      ) : a.cycle === "relearning" && (a.state === "relearning" || closed) ? (
        <p
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm"
          data-relearning-gate
        >
          <Lock className="size-4 text-muted-foreground" aria-hidden />
          {closed
            ? "This test is closed. Finish the relearning checklist above for every target you're retaking, then you can ask your teacher to retake it."
            : "Finish the relearning checklist above for every target you're retaking. The retake unlocks on its own."}
        </p>
      ) : a.nextAttemptAt && a.state !== "in_progress" ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          Your next attempt opens <LocalTime date={a.nextAttemptAt} />. Your teacher set a{" "}
          {a.retakeWaitHours}-hour wait between attempts.
          {a.state === "awaiting_unlock" ? " Your teacher also has to unlock it." : ""}
        </p>
      ) : a.state === "ask_to_retake" ? (
        // Jon, Oct 14 2026 (decisions 1–2): a closed test can still be retaken if the teacher says yes.
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
          data-ask-to-retake={a.askCounts ? "counted" : "optional"}
        >
          <span className="mr-auto inline-flex items-start gap-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {a.askCounts
                ? "This test is closed, and you still need a retake on some targets. Ask your teacher to let you retake it."
                : "This test is closed. Want a higher score? Ask your teacher to let you retake it."}{" "}
              If they say yes, it opens just for you until the end of the next school day.
            </span>
          </span>
          <RequestRetakeButton
            assignmentId={a.id}
            attemptNumber={a.attemptsUsed + 1}
            label="Ask to retake"
            primary={a.askCounts}
          />
        </div>
      ) : a.state === "awaiting_unlock" ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
          data-unlock-gate
        >
          <span className="mr-auto inline-flex items-center gap-2">
            <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {a.retakeRequested && a.status === "closed"
                ? "You asked to retake this test. Waiting on your teacher: if they say yes, it opens just for you until the end of the next school day."
                : a.retakeRequested
                  ? `Your request for attempt ${a.attemptsUsed + 1} is in. Your teacher will approve it, usually in class.`
                  : `Your teacher opens each retake. Ask for attempt ${a.attemptsUsed + 1} here, or in class.`}
            </span>
          </span>
          {a.retakeRequested ? null : (
            <RequestRetakeButton assignmentId={a.id} attemptNumber={a.attemptsUsed + 1} />
          )}
        </div>
      ) : canStart ? (
        <StartForm
          assignmentId={a.id}
          needsCode={a.needsCode}
          resume={a.state === "in_progress"}
          paused={a.state === "in_progress" && a.paused}
          timeLimitMinutes={a.timeLimitMinutes}
          label={retaking ? "Start retake" : "Start"}
          intro={
            retaking && a.retake ? (
              a.retake.plan.selected.length ? (
                <p>
                  Your retake covers{" "}
                  {a.retake.targets
                    .filter((t) => a.retake!.plan.selected.includes(t.id))
                    .map((t) => t.code)
                    .join(", ")}{" "}
                  with new questions. Your highest score on each target counts.
                  {a.timeLimitMinutes
                    ? ` The clock runs for ${a.timeLimitMinutes} minutes once you start.`
                    : ""}
                </p>
              ) : (
                <p>Choose at least one target above to retake it.</p>
              )
            ) : a.type === "formative" && a.attemptsUsed > 0 ? (
              <p>
                Same quiz, new attempt. Your highest score counts.
                {a.timeLimitMinutes
                  ? ` The clock runs for ${a.timeLimitMinutes} minutes once you start.`
                  : ""}
              </p>
            ) : undefined
          }
        />
      ) : (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          {a.status === "closed"
            ? "This assignment has closed."
            : a.state === "done" && a.retake && a.retake.plan.required.length === 0
              ? "All targets proficient. Nothing more to do here."
              : attemptsLeft === 0
                ? "You've used every attempt."
                : a.retakeWindowClosed
                  ? "Retakes on this quiz have closed."
                  : a.final?.basis === "corrections_to_full"
                    ? "Your corrections raised this quiz to 100%. Nothing more to do here."
                    : "Nothing more to do here."}
        </p>
      )}

      {attempts.length > 0 ? (
        <section className="rounded-lg border border-border bg-card">
          <h2 className="border-b border-border px-4 py-2 text-sm font-medium">Your attempts</h2>
          <ul className="divide-y divide-border">
            {attempts.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="font-medium">
                  Attempt {t.number}
                  {t.scope && a.retake
                    ? ` · retake ${a.retake.targets
                        .filter((x) => t.scope!.includes(x.id))
                        .map((x) => x.code)
                        .join(", ")}`
                    : ""}
                </span>
                <span className="text-muted-foreground">
                  {t.submittedAt ? <LocalTime date={t.submittedAt} /> : null}
                </span>
                <span className="ml-auto tabular">
                  {a.resultsReleased && t.score !== null && t.maxScore !== null
                    ? `${t.score} / ${t.maxScore} · ${Math.round(t.percent ?? 0)}%${t.status === "submitted" ? " so far" : ""}`
                    : "Submitted"}
                </span>
                {c && c.attemptId === t.id ? (
                  <Link
                    href={`/student/corrections/${t.id}`}
                    className="text-xs font-medium text-brand-deep hover:underline"
                  >
                    {c.state === "approved"
                      ? "Corrections approved"
                      : c.state === "submitted"
                        ? "Corrections submitted"
                        : c.state === "returned"
                          ? "Corrections returned"
                          : `Corrections · ${c.done} of ${c.needed}`}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          {a.resultsReleased && a.retake ? (
            <p className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-2 text-xs text-muted-foreground">
              <span>Best per target:</span>
              {a.retake.targets.map((t) => (
                <TargetChip
                  key={t.id}
                  code={t.code}
                  percent={t.percent}
                  tone={t.required ? "required" : "default"}
                />
              ))}
            </p>
          ) : null}
          {a.resultsReleased && attempts.some((t) => t.status === "submitted") ? (
            <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              Some answers are waiting for your teacher to grade them; the score will update.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
