import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, TriangleAlert } from "lucide-react";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { getSkywardExport } from "@/lib/queries/skyward";
import { Button } from "@/components/ui/button";
import { SkywardFiles } from "./skyward-files";

export const metadata: Metadata = { title: "Skyward export" };

/**
 * The Skyward export for one assignment (docs/relearning-revamp-plan.md K1–K2, ticket R8): one file
 * per Skyward assignment (a quiz per learning target, a test as one score), percents, the lunch-code
 * ID from each student's email, and who has no ID yet.
 */
export default async function SkywardExportPage({
  params,
}: PageProps<"/app/results/[assignmentId]/skyward">) {
  const { assignmentId } = await params;
  try {
    await requireOwner({ type: "assignment", id: assignmentId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const data = await getSkywardExport(assignmentId);
  if (!data) notFound();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link
          href={`/app/results/${assignmentId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> Results
        </Link>
        <h1 className="mt-2 text-2xl">Skyward export</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.assignment.title} · {data.assignment.className}. Each file is ready for
          Skyward&apos;s Import Scores: Last Name, First Name, ID (the lunch code from the
          student&apos;s email) and Score as a percent.
          {data.assignment.type === "formative" && data.files.length > 1
            ? " A quiz gives one file per learning target, like your F_LT columns."
            : ""}
        </p>
      </div>

      {data.note ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">{data.note}</p>
      ) : null}

      <SkywardFiles
        assignmentId={assignmentId}
        files={data.files.map((f) => ({ name: f.name, label: f.label, rows: f.rows }))}
      />

      {data.missing.length ? (
        <section
          className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 px-4 py-3 text-sm"
          data-missing-ids
        >
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert className="size-4 text-warning-foreground" aria-hidden />
            No Skyward ID for {data.missing.length}{" "}
            {data.missing.length === 1 ? "student" : "students"}
          </p>
          <p className="text-muted-foreground">
            Their email doesn&apos;t start with a lunch code, so their row goes out with a blank ID.
            Fix the email on the class roster first, or type the ID in Skyward.
          </p>
          <ul className="list-inside list-disc">
            {data.missing.map((m) => (
              <li key={`${m.name}:${m.email ?? ""}`}>
                {m.name}{" "}
                {m.email ? <span className="text-muted-foreground">({m.email})</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Need every score, attempt and how it came about?{" "}
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          nativeButton={false}
          render={<a href={`/api/results/${assignmentId}/export`} />}
        >
          <Download data-icon="inline-start" aria-hidden />
          Detailed CSV
        </Button>
      </p>
    </div>
  );
}
