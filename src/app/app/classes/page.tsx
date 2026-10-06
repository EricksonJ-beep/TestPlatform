import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { splitByCourse } from "@/lib/course-focus";
import { getCurrentCourse } from "@/lib/current-course";
import { listClasses } from "@/lib/queries/classes";
import { EmptyState } from "@/components/empty-state";
import { ClassGrid } from "./class-grid";
import { NewClassDialog } from "./new-class-dialog";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage() {
  const session = await requireTeacher();
  const [allClasses, { current }] = await Promise.all([
    listClasses(session.userId),
    getCurrentCourse(session.userId),
  ]);
  // Course focus (docs/course-focus-plan.md): this course's periods; periods with no course
  // are listed apart so they never vanish.
  const { mine: classes, orphans, elsewhere } = splitByCourse(allClasses, current);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl">Classes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rosters, student accounts, and password resets.
          </p>
        </div>
        <NewClassDialog defaultCourseName={current?.name} />
      </div>

      {classes.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Users}
            title={current ? `No classes in ${current.name} yet` : "No classes yet"}
            description="Create your first class, then add students one at a time or upload a roster CSV."
            action={<NewClassDialog label="Create a class" defaultCourseName={current?.name} />}
          />
        </div>
      ) : (
        <ClassGrid classes={classes} />
      )}
      {orphans.length > 0 ? (
        <section
          className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3"
          aria-label="Not in any course"
          data-orphans
        >
          <h2 className="px-1 text-sm font-medium text-muted-foreground">
            Not in any course <span className="font-normal tabular">· {orphans.length}</span>
            <span className="ml-2 font-normal">
              Open one and set its course so it shows with that course.
            </span>
          </h2>
          <ClassGrid classes={orphans} />
        </section>
      ) : null}
      {elsewhere > 0 ? (
        <p className="text-xs text-muted-foreground" data-elsewhere>
          {elsewhere} {elsewhere === 1 ? "class" : "classes"} in other courses. Switch course in the
          sidebar to see them.
        </p>
      ) : null}
    </div>
  );
}
