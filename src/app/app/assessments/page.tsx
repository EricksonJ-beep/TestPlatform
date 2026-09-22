import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { getCurrentCourse } from "@/lib/current-course";
import { listAssessments } from "@/lib/queries/assessments";
import { EmptyState } from "@/components/empty-state";
import { NewAssessmentDialog } from "./new-assessment-dialog";
import { TYPE_STYLE } from "./type-badge";

export const metadata: Metadata = { title: "Assessments" };

export default async function AssessmentsPage() {
  const session = await requireTeacher();
  const [assessments, { courses, current }] = await Promise.all([
    listAssessments(session.userId),
    getCurrentCourse(session.userId),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl">Assessments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Practice sets, formative quizzes, and summatives built from your banks and pools.
          </p>
        </div>
        <NewAssessmentDialog courses={courses} defaultCourseId={current?.id ?? null} />
      </div>

      {assessments.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={ClipboardList}
            title="No assessments yet"
            description="Start with a formative quiz of fixed questions, or a summative with one section per learning target."
            action={
              <NewAssessmentDialog
                courses={courses}
                defaultCourseId={current?.id ?? null}
                label="Create an assessment"
              />
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assessments.map((a) => (
            <li key={a.id}>
              <Link
                href={`/app/assessments/${a.id}`}
                className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors outline-none hover:border-brand/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base leading-tight">{a.title}</h2>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_STYLE[a.type]}`}
                  >
                    {a.type}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {a.courseName ?? "No course"} ·{" "}
                  <span className="tabular">
                    {a.sections} {a.sections === 1 ? "section" : "sections"}
                  </span>
                </p>
                <p className="mt-auto text-xs text-muted-foreground">
                  {a.isPublished ? "Published" : "Draft"}
                  {a.assignments > 0 ? ` · assigned ${a.assignments}×` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
