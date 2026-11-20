import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Users } from "lucide-react";
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
  const [allClasses, allArchived, { current }] = await Promise.all([
    listClasses(session.userId),
    listClasses(session.userId, "archived"),
    getCurrentCourse(session.userId),
  ]);
  // Archived classes (Jon, Nov 20 2026): this course's and the course-less ones, newest year first.
  const archivedSplit = splitByCourse(allArchived, current);
  const archived = [...archivedSplit.mine, ...archivedSplit.orphans].sort(
    (a, b) => (b.schoolYear ?? "").localeCompare(a.schoolYear ?? "") || a.name.localeCompare(b.name)
  );
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

      {classes.length === 0 && archived.length > 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {current ? `No running classes in ${current.name}.` : "No running classes."} Your archived
          classes are below.
        </p>
      ) : classes.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Users}
            title={current ? `No classes in ${current.name} yet` : "No classes yet"}
            description="Create your first class, then add students one at a time or upload a roster CSV."
            action={<NewClassDialog label="Create a class" defaultCourseName={current?.name} />}
          />
        </div>
      ) : (
        <ClassGrid key={classes.map((c) => c.id).join(",")} classes={classes} />
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
              {current
                ? `Put one in ${current.name} and it shows with that course.`
                : "Open one and set its course so it shows with that course."}
            </span>
          </h2>
          <ClassGrid
            key={orphans.map((c) => c.id).join(",")}
            classes={orphans}
            adoptInto={current ?? undefined}
          />
        </section>
      ) : null}
      {archived.length > 0 ? (
        <details className="rounded-lg border border-border bg-card" data-archived-classes>
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
            <Archive className="size-4 text-muted-foreground" aria-hidden />
            Archived{" "}
            <span className="font-normal text-muted-foreground tabular">· {archived.length}</span>
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {archived.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/app/classes/${c.id}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">
                    {[c.courseName, c.period ? `Period ${c.period}` : null, c.term, c.schoolYear]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground tabular">
                    {c.students} {c.students === 1 ? "student" : "students"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
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
