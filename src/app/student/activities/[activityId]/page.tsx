import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAuthzError, requireContentAccess } from "@/lib/authz";
import { getActivityForStudent } from "@/lib/queries/practice";
import { ActivityView } from "./activity-view";

export const metadata: Metadata = { title: "Activity" };

/** One relearning activity for a student; completion is checked by the kind's rule (PLAN.md §3.7). */
export default async function StudentActivityPage({
  params,
}: PageProps<"/student/activities/[activityId]">) {
  const { activityId } = await params;
  let access;
  try {
    access = await requireContentAccess({ type: "relearning_activity", id: activityId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  if (access.as !== "student") notFound();
  const view = await getActivityForStudent(activityId, access.userId);
  if (!view) notFound();
  return <ActivityView view={view} />;
}
