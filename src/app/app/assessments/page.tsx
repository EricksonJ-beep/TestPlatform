import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { getCurrentCourse } from "@/lib/current-course";
import { listAssessments } from "@/lib/queries/assessments";
import { listUnitsForTeacher } from "@/lib/queries/courses";
import { focusShelves, groupByUnit } from "@/lib/unit-shelves";
import { EmptyState } from "@/components/empty-state";
import { KindBoard } from "@/components/app/kind-board";
import { autoOrderAssessmentColumn, placeAssessmentInColumn } from "./actions";
import { NewAssessmentDialog } from "./new-assessment-dialog";
import { TYPE_STYLE } from "./type-badge";

export const metadata: Metadata = { title: "Assessments" };

export default async function AssessmentsPage() {
  const session = await requireTeacher();
  const [assessments, units, { courses, current }] = await Promise.all([
    listAssessments(session.userId),
    listUnitsForTeacher(session.userId),
    getCurrentCourse(session.userId),
  ]);
  const { course: focused, orphans } = focusShelves(
    assessments.map((a) => ({
      ...a,
      name: a.title,
      node: (
        <Link
          href={`/app/assessments/${a.id}`}
          draggable={false}
          className="flex h-full flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5 pl-7 transition-colors outline-none hover:border-brand/50 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <h3 className="text-sm leading-snug font-medium">{a.title}</h3>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground tabular">
            <span className={`rounded-md px-1.5 py-0.5 font-medium ${TYPE_STYLE[a.type]}`}>
              {a.type}
            </span>
            {a.isPublished ? "Published" : "Draft"}
            {a.assignments > 0 ? ` · assigned ${a.assignments}×` : ""}
          </p>
        </Link>
      ),
    })),
    units,
    current
  );
  // A teacher with no courses yet: everything sits under "No course", shown as one board.
  const board = focused ?? groupByUnit(orphans, units)[0] ?? null;

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
      ) : board ? (
        <KindBoard
          // Keyed on its cards: the board keeps drag state locally, so a server change
          // (a card put in this course, a new card) remounts it with the fresh cards.
          key={`${board.courseId ?? "none"}:${board.shelves.flatMap((s) => s.items.map((i) => i.id)).join(",")}`}
          course={board}
          orphans={focused ? orphans : []}
          adoptInto={focused && current ? { type: "assessment", course: current } : undefined}
          noun="assessment"
          place={placeAssessmentInColumn}
          autoOrder={autoOrderAssessmentColumn}
        />
      ) : null}
    </div>
  );
}
