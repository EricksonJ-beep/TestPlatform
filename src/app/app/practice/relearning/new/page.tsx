import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isAuthzError, isUuid, requireOwner } from "@/lib/authz";
import { getEditorTarget } from "@/lib/queries/relearning-options";
import { MODES, type RelearningMode } from "@/lib/relearning";
import { blankOption } from "@/lib/relearning-editor";
import { FollowCourse } from "@/components/app/course-focus";
import { OptionEditor } from "../option-editor";

export const metadata: Metadata = { title: "Add relearning" };

/** A new Read · Watch · Do option for one target (`?target=…&mode=watch`). */
export default async function NewRelearningOptionPage({
  searchParams,
}: PageProps<"/app/practice/relearning/new">) {
  const { target: targetId, mode } = await searchParams;
  if (!isUuid(targetId) || !MODES.includes(mode as RelearningMode)) notFound();
  const target = await getEditorTarget(targetId);
  if (!target) notFound();
  let session;
  try {
    session = await requireOwner({ type: "course", id: target.courseId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const m = mode as RelearningMode;
  const existing = await db.query.relearningOptions.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.relearningOptions.ownerId, session.userId),
      eq(schema.relearningOptions.learningTargetId, target.id),
      eq(schema.relearningOptions.mode, m)
    ),
  });
  if (existing) redirect(`/app/practice/relearning/${existing.id}`);
  return (
    <>
      <FollowCourse courseId={target.courseId} />
      <OptionEditor
        optionId={null}
        target={target}
        mode={m}
        initial={blankOption(m, target.code)}
        editedAt={null}
        inProgress={0}
        mediaUrls={{}}
      />
    </>
  );
}
