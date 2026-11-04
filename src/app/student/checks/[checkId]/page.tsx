import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAuthzError, requirePracticeCheckAccess } from "@/lib/authz";
import { getCheckPayload } from "@/lib/queries/practice-checks";
import { CheckRunner } from "./check-runner";

export const metadata: Metadata = { title: "Practice check" };

/** One practice check (relearning revamp, R3): 5 questions, first answer counts, Look back. */
export default async function PracticeCheckPage({
  params,
}: PageProps<"/student/checks/[checkId]">) {
  const { checkId } = await params;
  let access;
  try {
    access = await requirePracticeCheckAccess(checkId);
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  if (access.as !== "student") notFound();
  const payload = await getCheckPayload(checkId);
  if (!payload) notFound();
  return <CheckRunner payload={payload} />;
}
