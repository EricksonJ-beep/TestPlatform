import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, Lock } from "lucide-react";
import { isAuthzError, requireAssignmentAccess } from "@/lib/authz";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { listStudentAttempts } from "@/lib/queries/attempts";
import { LocalTime } from "@/components/local-time";
import { StartForm } from "./start-form";

export const metadata: Metadata = { title: "Assignment" };

/** The launch pad for one assignment: rules, the access code prompt, and past attempts. */
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
  const canStart =
    a.status === "open" && (a.state === "in_progress" || attemptsLeft === null || attemptsLeft > 0);

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

      {a.state === "upcoming" ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          This opens <LocalTime date={a.opensAt} />. Check back then.
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
        />
      ) : (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          {a.status === "closed" ? "This assignment has closed." : "You've used every attempt."}
        </p>
      )}

      {attempts.length > 0 ? (
        <section className="rounded-lg border border-border bg-card">
          <h2 className="border-b border-border px-4 py-2 text-sm font-medium">Your attempts</h2>
          <ul className="divide-y divide-border">
            {attempts.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="font-medium">Attempt {t.number}</span>
                <span className="text-muted-foreground">
                  {t.submittedAt ? <LocalTime date={t.submittedAt} /> : null}
                </span>
                <span className="ml-auto tabular">
                  {a.resultsReleased && t.score !== null && t.maxScore !== null
                    ? `${t.score} / ${t.maxScore} · ${Math.round(t.percent ?? 0)}%${t.status === "submitted" ? " so far" : ""}`
                    : "Submitted"}
                </span>
              </li>
            ))}
          </ul>
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
