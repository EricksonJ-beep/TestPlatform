import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAuthzError, requirePracticeAttemptAccess } from "@/lib/authz";
import { getPracticeRunnerPayload } from "@/lib/queries/practice";
import { PracticeRunner } from "./practice-runner";

export const metadata: Metadata = { title: "Practice" };

/** One practice attempt: instant feedback per question, never graded. */
export default async function PracticeAttemptPage({
  params,
}: PageProps<"/student/practice/[attemptId]">) {
  const { attemptId } = await params;
  let access;
  try {
    access = await requirePracticeAttemptAccess(attemptId);
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  if (access.as !== "student") notFound();
  const payload = await getPracticeRunnerPayload(attemptId);
  if (!payload) notFound();
  return <PracticeRunner payload={payload} />;
}
