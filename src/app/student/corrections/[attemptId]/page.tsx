import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireAttemptAccess } from "@/lib/authz";
import { getCorrectionsForm } from "@/lib/queries/corrections";
import { CorrectionsForm } from "./corrections-form";

export const metadata: Metadata = { title: "Corrections" };

/** The corrections form (PLAN.md §5 screen 5). The payload is sanitized: no keys or explanations reach the browser. */
export default async function CorrectionsPage({
  params,
}: PageProps<"/student/corrections/[attemptId]">) {
  const { attemptId } = await params;
  let access;
  try {
    access = await requireAttemptAccess(attemptId);
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  if (access.as !== "student") notFound();
  const form = await getCorrectionsForm(attemptId);
  if (!form) notFound();

  if (form.items.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Link
          href={`/student/assignments/${form.assignment.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> {form.assignment.title}
        </Link>
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          Nothing to correct on attempt {form.attempt.number}. Nice work.
        </p>
      </div>
    );
  }
  return <CorrectionsForm form={form} />;
}
