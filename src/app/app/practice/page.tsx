import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Layers } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { getCurrentCourse } from "@/lib/current-course";
import { focusPractice, groupPractice, type PracticeItem } from "@/lib/practice-groups";
import type { UnitRef } from "@/lib/unit-shelves";
import { listUnitsForTeacher } from "@/lib/queries/courses";
import { listPracticeContent } from "@/lib/queries/practice";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { PracticeAccordion } from "./practice-accordion";
import { NewActivityDialog, NewPracticeSetDialog } from "./new-content-dialogs";

export const metadata: Metadata = { title: "Practice sets" };

/** Teacher screen 4 (PLAN.md §5): build and publish practice sets and relearning activities. */
export default async function PracticePage() {
  const session = await requireTeacher();
  const [{ sets, activities }, units, { courses, current }] = await Promise.all([
    listPracticeContent(session.userId),
    listUnitsForTeacher(session.userId),
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
        <FocusedPractice items={items} units={units} current={current} />
      )}
    </div>
  );
}

/**
 * Course focus (docs/course-focus-plan.md): the current course's unit rows,
 * no course heading (the sidebar names it), and items with no course listed
 * apart. A teacher with no courses yet sees everything grouped as before.
 */
function FocusedPractice({
  items,
  units,
  current,
}: {
  items: PracticeItem[];
  units: UnitRef[];
  current: { id: string; name: string } | null;
}) {
  if (!current) return <PracticeAccordion groups={groupPractice(items, units)} />;
  const { group, orphans } = focusPractice(items, units, current);
  return (
    <PracticeAccordion groups={[group]} orphans={orphans} headings={false} adoptInto={current} />
  );
}
