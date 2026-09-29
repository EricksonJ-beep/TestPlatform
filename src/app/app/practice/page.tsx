import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Layers } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { getCurrentCourse } from "@/lib/current-course";
import { groupByCourse } from "@/lib/group-by-course";
import { listPracticeContent } from "@/lib/queries/practice";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ContentList } from "./content-list";
import { NewActivityDialog, NewPracticeSetDialog } from "./new-content-dialogs";

export const metadata: Metadata = { title: "Practice sets" };

/** Teacher screen 4 (PLAN.md §5): build and publish practice sets and relearning activities. */
export default async function PracticePage() {
  const session = await requireTeacher();
  const [{ sets, activities }, { courses, current }] = await Promise.all([
    listPracticeContent(session.userId),
    getCurrentCourse(session.userId),
  ]);
  const items = [...sets, ...activities].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)
  );
  const defaultCourseId = current?.id ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl">Practice sets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Always-open practice and relearning activities, tagged to learning targets. Students
            need one activity and one practice set per target before a retake.
          </p>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/app/practice/worksheets" />}
        >
          <FileSpreadsheet data-icon="inline-start" aria-hidden />
          Worksheets
        </Button>
        <NewActivityDialog courses={courses} defaultCourseId={defaultCourseId} />
        <NewPracticeSetDialog courses={courses} defaultCourseId={defaultCourseId} />
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Layers}
            title="Nothing published yet"
            description="Start with a practice set drawn from a unit pool, then add a short video or reading for each learning target."
            action={
              <div className="flex flex-wrap gap-2">
                <NewPracticeSetDialog
                  courses={courses}
                  defaultCourseId={defaultCourseId}
                  label="Create a practice set"
                />
                <NewActivityDialog
                  courses={courses}
                  defaultCourseId={defaultCourseId}
                  label="Create an activity"
                />
              </div>
            }
          />
        </div>
      ) : (
        groupByCourse(items).map((g) => (
          <section key={g.course} className="flex flex-col gap-3" aria-label={g.course}>
            <h2 className="text-lg">
              {g.course}{" "}
              <span className="text-sm font-normal text-muted-foreground tabular">
                · {g.items.length} {g.items.length === 1 ? "item" : "items"}
              </span>
            </h2>
            <ContentList items={g.items} />
          </section>
        ))
      )}
    </div>
  );
}
