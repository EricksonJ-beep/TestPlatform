import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { listCourses } from "@/lib/queries/courses";
import { EmptyState } from "@/components/empty-state";
import { NewCourseDialog } from "./new-course-dialog";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage() {
  const session = await requireTeacher();
  const courses = await listCourses(session.userId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl">Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each course holds its units, learning targets, and question pools.
          </p>
        </div>
        <NewCourseDialog />
      </div>

      {courses.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            description="Create Biology or Physical Science, then add its learning targets."
            action={<NewCourseDialog label="Create a course" />}
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/courses/${c.id}`}
                className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors outline-none hover:border-brand/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <h2 className="text-base leading-tight">{c.name}</h2>
                {c.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                ) : null}
                <p className="mt-auto text-xs text-muted-foreground tabular">
                  {c.units} units · {c.targets} targets · {c.pools} pools · {c.classes} classes
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
