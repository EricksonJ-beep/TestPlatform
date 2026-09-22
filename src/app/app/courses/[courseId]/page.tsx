import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText } from "lucide-react";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { getCourseDetail } from "@/lib/queries/courses";
import { CourseHeader } from "./course-header";
import { PoolsPanel } from "./pools-panel";
import { TargetsPanel } from "./targets-panel";
import { UnitsPanel } from "./units-panel";

export const metadata: Metadata = { title: "Course" };

export default async function CoursePage({ params }: PageProps<"/app/courses/[courseId]">) {
  const { courseId } = await params;
  try {
    await requireOwner({ type: "course", id: courseId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const course = await getCourseDetail(courseId);
  if (!course) notFound();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <Link
          href="/app/courses"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> Courses
        </Link>
        <CourseHeader
          course={{ id: course.id, name: course.name, description: course.description }}
        />
        <Link
          href={`/app/courses/${course.id}/stimuli`}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-deep hover:underline"
        >
          <FileText className="size-4" aria-hidden /> Shared stimuli
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <UnitsPanel courseId={course.id} units={course.units} />
          <PoolsPanel courseId={course.id} pools={course.pools} targets={course.targets} />
        </div>
        <TargetsPanel courseId={course.id} targets={course.targets} units={course.units} />
      </div>
    </div>
  );
}
