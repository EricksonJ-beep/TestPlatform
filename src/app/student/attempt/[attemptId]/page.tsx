import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isAuthzError, requireAttemptAccess } from "@/lib/authz";
import { getRunnerPayload } from "@/lib/queries/attempts";
import { TestRunner } from "./test-runner";

export const metadata: Metadata = { title: "Test" };

/** The test screen. The payload is sanitized server-side: no correct answers reach the browser. */
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
  const payload = await getRunnerPayload(attemptId);
  if (!payload) notFound();
  if (payload.attempt.status !== "in_progress")
    redirect(`/student/assignments/${payload.assignment.id}`);
  return <TestRunner payload={payload} />;
}
