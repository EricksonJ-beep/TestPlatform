import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, Lock } from "lucide-react";
import { isAuthzError, requireAssignmentAccess } from "@/lib/authz";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { listStudentAttempts } from "@/lib/queries/attempts";
import { LocalTime } from "@/components/local-time";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { RetakePicker } from "../../retake-picker";
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
  const correctionsBlock = !!c && c.state !== "approved" && c.state !== "none";
  const retaking = a.state === "retake_required" || a.state === "retake_available";
  const canStart =
    a.status === "open" &&
    (a.state === "in_progress" || a.state === "not_started" || retaking) &&
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
          {a.closesAt ? (
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
        </p>
      </div>

      {a.retake && a.attemptsUsed > 0 && a.state !== "in_progress" ? (
        <section className="rounded-lg border border-border bg-card px-4 py-3" data-retake-panel>
          <h2 className="mb-2 text-sm font-medium">Retake by learning target</h2>
          <RetakePicker
            assignmentId={a.id}
            retake={a.retake}
            checklist={a.state === "relearning" || retaking}
          />
        </section>
      ) : null}

      {a.state === "upcoming" ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          This opens <LocalTime date={a.opensAt} />. Check back then.
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
                ? "Your teacher sent your corrections back. Revise and resubmit to unlock your next attempt."
                : `Correct ${c.remaining} missed ${c.remaining === 1 ? "question" : "questions"} on attempt ${c.attemptNumber}${attemptsLeft === null || attemptsLeft > 0 ? " to unlock your next attempt" : ""}.`}
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
      ) : a.state === "relearning" ? (
        <p
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm"
          data-relearning-gate
        >
          <Lock className="size-4 text-muted-foreground" aria-hidden />
          Finish the relearning checklist above for every target you&apos;re retaking. The retake
          unlocks on its own.
        </p>
      ) : a.nextAttemptAt && a.state !== "in_progress" ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          Your next attempt opens <LocalTime date={a.nextAttemptAt} />. Your teacher set a{" "}
          {a.retakeWaitHours}-hour wait between attempts.
        </p>
      ) : canStart ? (
        <StartForm
          assignmentId={a.id}
          needsCode={a.needsCode}
          resume={a.state === "in_progress"}
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
              : "You've used every attempt."}
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
