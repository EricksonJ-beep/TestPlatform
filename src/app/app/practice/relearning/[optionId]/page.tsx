import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { getEditorOption } from "@/lib/queries/relearning-options";
import { optionToForm } from "@/lib/relearning-editor";
import { FollowCourse } from "@/components/app/course-focus";
import { OptionEditor } from "../option-editor";

export const metadata: Metadata = { title: "Edit relearning" };

/** One Read · Watch · Do option in the editor (Nov 5 2026). */
export default async function RelearningOptionPage({
  params,
}: PageProps<"/app/practice/relearning/[optionId]">) {
  const { optionId } = await params;
  try {
    await requireOwner({ type: "relearning_option", id: optionId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const option = await getEditorOption(optionId);
  if (!option) notFound();
  const mediaIds = option.sections.map((s) => s.mediaAssetId).filter((id): id is string => !!id);
  const media = mediaIds.length
    ? await db
        .select({ id: schema.mediaAssets.id, url: schema.mediaAssets.url })
        .from(schema.mediaAssets)
        .where(inArray(schema.mediaAssets.id, mediaIds))
    : [];
  const mediaUrls: Record<string, string> = {};
  for (const s of option.sections) {
    const url = media.find((m) => m.id === s.mediaAssetId)?.url;
    if (url) mediaUrls[s.id] = url;
  }
  return (
    <>
      <FollowCourse courseId={option.target.courseId} />
      <OptionEditor
        optionId={option.id}
        target={option.target}
        mode={option.mode}
        initial={optionToForm(option)}
        editedAt={option.editedAt?.toISOString() ?? null}
        inProgress={option.inProgress}
        mediaUrls={mediaUrls}
      />
    </>
  );
}
