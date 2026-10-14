import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Layers } from "lucide-react";
import { requireStudent, studentCourseIds } from "@/lib/authz";
import { listCustomPracticeOptions } from "@/lib/custom-practice";
import { EmptyState } from "@/components/empty-state";
import { BuildPractice } from "./build-practice";

export const metadata: Metadata = { title: "Build my practice" };

/**
 * "Build my practice" (Jon, Oct 13 2026): the student picks a unit and one,
 * several, or all of its learning targets, and gets a fresh set of questions
 * every time. Always open; nothing is assigned and nothing is graded. A to-do
 * row's "Practice" opens it on one target (`?target=`, Oct 14 2026, R3).
 */
export default async function BuildPracticePage({
  searchParams,
}: PageProps<"/student/practice/build">) {
  const session = await requireStudent();
  const sp = await searchParams;
  const courses = await listCustomPracticeOptions(await studentCourseIds(session.userId));
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link
        href="/student"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Home
      </Link>
      <div>
        <h1 className="text-2xl">Build my practice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a unit and the learning targets you want to work on. You get new questions every
          time, and practice never counts against you.
        </p>
      </div>
      {courses.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Layers}
            title="Nothing to practice yet"
            description="Your teacher hasn't opened any practice questions for your courses yet."
          />
        </div>
      ) : (
        <BuildPractice
          courses={courses}
          initialCourseId={pick(sp.course)}
          initialUnitId={pick(sp.unit)}
          initialTargetId={pick(sp.target)}
        />
      )}
    </div>
  );
}
