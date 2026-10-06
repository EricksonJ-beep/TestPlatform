import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db, schema } from "@/db";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { getAssignmentRow } from "@/lib/queries/assignments";
import { listPins, listPublishedContent } from "@/lib/queries/practice";
import { PinsForm } from "./pins-form";
import { FollowCourse } from "@/components/app/course-focus";

export const metadata: Metadata = { title: "Relearning pins" };

/** Per target on one summative: which activity and practice set the retake gate requires (PLAN.md §3.7). */
export default async function RelearningPinsPage({
  params,
}: PageProps<"/app/assign/[assignmentId]/relearning">) {
  const { assignmentId } = await params;
  try {
    await requireOwner({ type: "assignment", id: assignmentId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const a = await getAssignmentRow(assignmentId);
  if (!a) notFound();
  const [assessment] = await db
    .select({ courseId: schema.assessments.courseId })
    .from(schema.assessments)
    .where(eq(schema.assessments.id, a.assessmentId))
    .limit(1);
  // The targets a retake can cover: every section target on the assessment.
  const targets = await db
    .selectDistinct({
      id: schema.learningTargets.id,
      code: schema.learningTargets.code,
      title: schema.learningTargets.title,
      sortOrder: schema.learningTargets.sortOrder,
    })
    .from(schema.assessmentSections)
    .innerJoin(
      schema.learningTargets,
      eq(schema.assessmentSections.learningTargetId, schema.learningTargets.id)
    )
    .where(
      and(
        eq(schema.assessmentSections.assessmentId, a.assessmentId),
        isNotNull(schema.assessmentSections.learningTargetId)
      )
    )
    .orderBy(asc(schema.learningTargets.sortOrder), asc(schema.learningTargets.code));
  const [content, pins] = await Promise.all([
    assessment?.courseId
      ? listPublishedContent(assessment.courseId)
      : Promise.resolve({ sets: [], activities: [] }),
    listPins(assignmentId),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <FollowCourse courseId={assessment?.courseId} />
      <div>
        <Link
          href="/app/assign"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> Assign
        </Link>
        <h1 className="mt-2 text-2xl">Relearning before the retake</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {a.assessmentTitle} · {a.className}. For each target a student must retake, they finish
          corrections, one activity, and one practice set. By default any published item tagged to
          the target counts; pin a specific one here to require it.
        </p>
      </div>
      {a.assessmentType !== "summative" ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          Retake gates apply to summatives only.
        </p>
      ) : targets.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          This assessment has no sections tagged to a learning target, so there is nothing to pin.
        </p>
      ) : (
        <PinsForm
          assignmentId={assignmentId}
          targets={targets.map(({ id, code, title }) => ({ id, code, title }))}
          content={content}
          pins={pins}
        />
      )}
    </div>
  );
}
