import type { Metadata } from "next";
import { Send } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { listTeacherAssignments, listAssignableAssessments } from "@/lib/queries/assignments";
import { listClasses } from "@/lib/queries/classes";
import { EmptyState } from "@/components/empty-state";
import { AssignmentDialog } from "./assignment-dialog";
import { AssignmentsTable } from "./assignments-table";

export const metadata: Metadata = { title: "Assign" };

export default async function AssignPage() {
  const session = await requireTeacher();
  const [assignments, assessments, classes] = await Promise.all([
    listTeacherAssignments(session.userId),
    listAssignableAssessments(session.userId),
    listClasses(session.userId),
  ]);
  const classOptions = classes.map((c) => ({ id: c.id, name: c.name, students: c.students }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl">Assign</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a published assessment to a class with a window, access code, time limit, and
            attempt policy.
          </p>
        </div>
        <AssignmentDialog assessments={assessments} classes={classOptions} />
      </div>

      {assignments.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Send}
            title="Nothing assigned yet"
            description={
              assessments.length === 0
                ? "Publish an assessment first; then it can be assigned here."
                : "Pick an assessment and a class. Students see it on their home page as soon as the window opens."
            }
            action={
              assessments.length > 0 ? (
                <AssignmentDialog
                  assessments={assessments}
                  classes={classOptions}
                  label="Assign an assessment"
                />
              ) : undefined
            }
          />
        </div>
      ) : (
        <AssignmentsTable
          assignments={assignments}
          assessments={assessments}
          classes={classOptions}
        />
      )}
    </div>
  );
}
