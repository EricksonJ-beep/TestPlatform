import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { getAssignmentRow } from "@/lib/queries/assignments";
import { getClassReview } from "@/lib/queries/results";
import { ClassReview } from "./class-review";

export const metadata: Metadata = { title: "Review with the class" };

/**
 * Projectable item review (Jon, Oct 1 2026): each question in big type with
 * its answer choices and how many students picked each, correct answers
 * hidden until revealed. Starts on the questions under 50%.
 */
export default async function ClassReviewPage({
  params,
}: PageProps<"/app/results/[assignmentId]/review">) {
  const { assignmentId } = await params;
  try {
    await requireOwner({ type: "assignment", id: assignmentId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const [a, items] = await Promise.all([getAssignmentRow(assignmentId), getClassReview(assignmentId)]);
  if (!a) notFound();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <Link
          href={`/app/results/${assignmentId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> Results
        </Link>
        <h1 className="mt-2 text-2xl">{a.assessmentTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {a.className} · {a.submitted} of {a.enrolled} submitted · what the class picked on each
          question
        </p>
      </div>
      <ClassReview assignmentId={assignmentId} items={items} />
    </div>
  );
}
