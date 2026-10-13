import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { settleAttempt } from "@/lib/attempt-pause";
import { isAuthzError, requireAttemptAccess } from "@/lib/authz";
import { getPausedView, getRunnerPayload } from "@/lib/queries/attempts";
import { PausedScreen } from "./paused-screen";
import { TestRunner } from "./test-runner";

export const metadata: Metadata = { title: "Test" };

/**
 * The test screen. The payload is sanitized server-side: no correct answers
 * reach the browser. A paused test (Finish later, Oct 13 2026) shows its
 * paused screen instead, and its questions never leave the server.
 */
export default async function AttemptPage({ params }: PageProps<"/student/attempt/[attemptId]">) {
  const { attemptId } = await params;
  let access;
  try {
    access = await requireAttemptAccess(attemptId);
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  if (access.as !== "student") notFound();
  if (await settleAttempt(attemptId)) {
    const paused = await getPausedView(attemptId);
    if (paused) return <PausedScreen view={paused} />;
  }
  const payload = await getRunnerPayload(attemptId);
  if (!payload) notFound();
  if (payload.attempt.status !== "in_progress")
    redirect(`/student/assignments/${payload.assignment.id}`);
  return <TestRunner payload={payload} />;
}
