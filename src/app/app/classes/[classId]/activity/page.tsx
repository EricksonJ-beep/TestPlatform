import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { listClassActivity } from "@/lib/activity-log";
import { getClassDetail } from "@/lib/queries/classes";
import { ActivityFeed } from "@/components/app/activity-feed";
import { StudentFilter } from "./student-filter";

export const metadata: Metadata = { title: "Activity" };

/** Jon, Oct 1 2026: when each student was active and what they did, newest first, one class at a time. */
export default async function ClassActivityPage({
  params,
  searchParams,
}: PageProps<"/app/classes/[classId]/activity">) {
  const { classId } = await params;
  try {
    await requireOwner({ type: "class", id: classId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const cls = await getClassDetail(classId);
  if (!cls) notFound();
  const raw = (await searchParams).student;
  const studentId =
    typeof raw === "string" && cls.roster.some((r) => r.studentId === raw) ? raw : null;
  const rows = await listClassActivity(classId, { studentId, limit: 300 });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <Link
          href={`/app/classes/${classId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> {cls.name}
        </Link>
        <h1 className="mt-2 text-2xl">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Logins, attempts, corrections, practice, and retake requests. Newest first.
        </p>
      </div>
      <StudentFilter
        classId={classId}
        current={studentId}
        students={cls.roster.map((r) => ({
          id: r.studentId,
          name: `${r.lastName}, ${r.firstName}`,
        }))}
      />
      <ActivityFeed rows={rows} showName={!studentId} groupByDay />
    </div>
  );
}
