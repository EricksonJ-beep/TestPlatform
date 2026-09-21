import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { getClassDetail } from "@/lib/queries/classes";
import { AddStudentDialog } from "./add-student-dialog";
import { ImportCsvDialog } from "./import-csv-dialog";
import { Roster } from "./roster";

export const metadata: Metadata = { title: "Class" };

export default async function ClassPage({ params }: PageProps<"/app/classes/[classId]">) {
  const { classId } = await params;
  try {
    await requireOwner({ type: "class", id: classId });
  } catch (err) {
    if (isAuthzError(err)) notFound(); // another teacher's class looks like it doesn't exist
    throw err;
  }
  const cls = await getClassDetail(classId);
  if (!cls) notFound();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <Link
          href="/app/classes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> Classes
        </Link>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl">{cls.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[cls.courseName, cls.period ? `Period ${cls.period}` : null, cls.term]
                .filter(Boolean)
                .join(" · ") || "No course, period, or term set"}
              {" · "}
              <span className="tabular">
                {cls.roster.length} {cls.roster.length === 1 ? "student" : "students"}
              </span>
            </p>
          </div>
          <ImportCsvDialog classId={cls.id} />
          <AddStudentDialog classId={cls.id} />
        </div>
      </div>

      <Roster classId={cls.id} roster={cls.roster} />
    </div>
  );
}
