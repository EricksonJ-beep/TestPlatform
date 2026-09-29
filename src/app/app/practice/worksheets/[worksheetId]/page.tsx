import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { listTargets } from "@/lib/queries/courses";
import { getWorksheetDetail, listLinkableStudents } from "@/lib/queries/worksheets";
import { WorksheetEditor } from "./worksheet-editor";

export const metadata: Metadata = { title: "Worksheet" };

export default async function WorksheetPage({
  params,
}: PageProps<"/app/practice/worksheets/[worksheetId]">) {
  const { worksheetId } = await params;
  let session;
  try {
    session = await requireOwner({ type: "worksheet", id: worksheetId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const detail = await getWorksheetDetail(worksheetId);
  if (!detail) notFound();
  const [targets, students] = await Promise.all([
    detail.courseId ? listTargets(detail.courseId) : Promise.resolve([]),
    listLinkableStudents(session.userId),
  ]);
  const site = (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/app/practice/worksheets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> Worksheets
      </Link>
      <WorksheetEditor
        detail={detail}
        targets={targets.map((t) => ({ id: t.id, code: t.code, title: t.title }))}
        students={students}
        webhookUrl={`${site}/api/integrations/worksheet`}
        secret={process.env.BLOOM_WORKSHEET_SECRET?.trim() ?? ""}
      />
    </div>
  );
}
