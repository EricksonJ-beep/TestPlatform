import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireContentAccess } from "@/lib/authz";
import { listTargets } from "@/lib/queries/courses";
import { getActivityDetail } from "@/lib/queries/practice";
import { isStorageConfigured } from "@/lib/storage";
import { ActivityEditor } from "./activity-editor";

export const metadata: Metadata = { title: "Relearning activity" };

export default async function ActivityPage({
  params,
}: PageProps<"/app/practice/activities/[activityId]">) {
  const { activityId } = await params;
  let access;
  try {
    access = await requireContentAccess({ type: "relearning_activity", id: activityId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  if (access.as !== "teacher") notFound();
  const detail = await getActivityDetail(activityId);
  if (!detail) notFound();
  if (detail.worksheetId) redirect(`/app/practice/worksheets/${detail.worksheetId}`);
  const targets = detail.courseId ? await listTargets(detail.courseId) : [];
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/app/practice"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> Practice sets
      </Link>
      <ActivityEditor
        detail={detail}
        targets={targets.map((t) => ({ id: t.id, code: t.code, title: t.title }))}
        storageConfigured={isStorageConfigured()}
      />
    </div>
  );
}
