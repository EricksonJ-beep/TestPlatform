import Link from "next/link";
import { eq } from "drizzle-orm";
import { KeyRound, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { requireStudent, studentCourseIds } from "@/lib/authz";
import { listCustomPracticeOptions } from "@/lib/custom-practice";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { listStudentClasses } from "@/lib/queries/classes";
import { getStudentPractice } from "@/lib/queries/practice";
import { listStudentResults } from "@/lib/queries/student-results";
import { buildStudentToDo } from "@/lib/student-home";
import { AssessmentsTab } from "./assessments-tab";
import { HomeTabs } from "./home-tabs";
import { PracticeTab } from "./practice-tab";
import { ResultsTab } from "./results-tab";
import { ToDoList } from "./todo-list";

/**
 * The student home (Jon, Oct 14 2026, docs/student-home-plan.md "Student home"): the greeting and
 * how many things are on the list, the To do list above the tabs, then Assessments | Practice |
 * My results (`?tab=`), then the class chips. Reads only, so "View as student" sees it as is.
 */
export default async function StudentHome() {
  const session = await requireStudent();
  const [classes, assignments] = await Promise.all([
    listStudentClasses(session.userId),
    listStudentAssignments(session.userId),
  ]);
  const [practice, buildable, results, me] = await Promise.all([
    getStudentPractice(session.userId, assignments),
    studentCourseIds(session.userId).then(listCustomPracticeOptions),
    listStudentResults(session.userId, assignments),
    db.query.users.findFirst({
      columns: { mustChangePassword: true },
      where: eq(schema.users.id, session.userId),
    }),
  ]);
  // One list, one count (Jon, Oct 14 2026): what the header says is what To do shows.
  const list = buildStudentToDo({
    assignments,
    activities: practice.activities,
    buildableTargetIds: new Set(
      buildable.flatMap((c) => c.units.flatMap((u) => u.targets.map((t) => t.id)))
    ),
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl">Hi, {session.firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground" data-todo-count={list.count}>
          {list.headline}
        </p>
      </div>

      {me?.mustChangePassword ? (
        <Link
          href="/student/password"
          className="flex items-center gap-3 rounded-lg border border-warning/50 bg-warning-soft px-4 py-3 text-sm text-warning-foreground hover:border-warning"
          data-password-nudge
        >
          <KeyRound className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">
            You&apos;re still using the temporary password your teacher gave you. Pick your own so
            nobody else can log in as you.
          </span>
          <span className="font-medium">Change it →</span>
        </Link>
      ) : null}

      <ToDoList list={list} />

      <HomeTabs
        panels={{
          assessments: <AssessmentsTab assignments={assignments} />,
          practice: <PracticeTab practice={practice} buildable={buildable} />,
          results: <ResultsTab results={results} />,
        }}
      />

      <ul className="flex flex-wrap items-center gap-2" aria-label="Your classes">
        {classes.map((c) => (
          <li
            key={c.id}
            className="rounded-md bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-deep"
          >
            {c.name}
            <span className="font-normal text-brand-deep/80">
              {" · "}
              {c.teacherLastName}
            </span>
          </li>
        ))}
        <li>
          <Link
            href="/student/join"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3" aria-hidden /> Join a class
          </Link>
        </li>
      </ul>
    </div>
  );
}
