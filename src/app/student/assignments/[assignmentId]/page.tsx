import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireAssignmentAccess } from "@/lib/authz";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { LocalTime } from "@/components/local-time";

export const metadata: Metadata = { title: "Assignment" };

/** Assignment details for an enrolled student. Starting an attempt arrives with Ticket 1.9. */
export default async function StudentAssignmentPage({
  params,
}: PageProps<"/student/assignments/[assignmentId]">) {
  const { assignmentId } = await params;
  let access;
  try {
    access = await requireAssignmentAccess(assignmentId);
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  if (access.as !== "student") notFound();
  const a = (await listStudentAssignments(access.userId)).find((x) => x.id === assignmentId);
  if (!a) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href="/student"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> Home
      </Link>
      <h1 className="text-2xl">{a.title}</h1>
      <p className="text-sm text-muted-foreground">
        {a.className} · {a.teacherLastName}
        {a.closesAt ? (
          <>
            {" · Due "}
            <LocalTime date={a.closesAt} />
          </>
        ) : null}
        {a.timeLimitMinutes ? ` · ${a.timeLimitMinutes} min` : ""}
      </p>
      <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
        {a.state === "upcoming"
          ? "This opens soon. Check back when your teacher opens it."
          : "The test screen is on its way; your teacher will tell you when to start."}
      </p>
    </div>
  );
}
