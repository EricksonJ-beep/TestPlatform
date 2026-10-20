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
import { buildStudentToDo, homeLanes, homeTab } from "@/lib/student-home";
import { AssessmentsTab } from "./assessments-tab";
import { PracticeTab } from "./practice-tab";
import { ResultsTab } from "./results-tab";
import { ToDoList } from "./todo-list";

const TAB_TITLE = {
  assessments: "Assessments",
  practice: "Practice",
  results: "My results",
} as const;

/**
 * The student home (Jon, Oct 14 2026, docs/student-home-plan.md; Oct 20 2026 redesign, option B
 * "Three lanes"): the sections live in the top bar (`?tab=`, layout). Home shows the greeting with
 * a count per lane, then the three lanes (Now · Fix it · Level up), then the class chips; each
 * other section has the page to itself. Reads only, so "View as student" sees it as is.
 */
export default async function StudentHome({ searchParams }: PageProps<"/student">) {
  const tab = homeTab((await searchParams).tab);
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

  if (tab !== "home")
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <h1 className="text-2xl">{TAB_TITLE[tab]}</h1>
        {tab === "assessments" ? (
          <AssessmentsTab assignments={assignments} />
        ) : tab === "practice" ? (
          <PracticeTab practice={practice} buildable={buildable} />
        ) : (
          <ResultsTab results={results} />
        )}
      </div>
    );

  // One list, one count (Jon, Oct 14 2026): what the header says is what the lanes show.
  const list = buildStudentToDo({
    assignments,
    activities: practice.activities,
    buildableTargetIds: new Set(
      buildable.flatMap((c) => c.units.flatMap((u) => u.targets.map((t) => t.id)))
    ),
  });
  const lanes = homeLanes(list);
  const chips = [
    { n: lanes.now.length, label: "to start", className: "bg-coral-soft text-[#b93e27]" },
    { n: lanes.fix.length, label: "to fix", className: "bg-warning-soft text-warning-foreground" },
    { n: lanes.level.length, label: "to level up", className: "bg-brand-soft text-brand-deep" },
  ].filter((c) => c.n > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl">Hi, {session.firstName}</h1>
          <p
            className="sr-only sm:not-sr-only sm:text-sm sm:text-muted-foreground"
            data-todo-count={list.count}
          >
            {list.headline}
          </p>
          {chips.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="Your lanes">
              {chips.map((c) => (
                <li
                  key={c.label}
                  className={`rounded-full px-3 py-1 text-sm font-bold tabular ${c.className}`}
                >
                  {c.n} {c.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <ul className="flex flex-wrap items-center gap-2" aria-label="Your classes">
          {classes.map((c) => (
            <li
              key={c.id}
              className="rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-deep"
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
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3" aria-hidden /> Join a class
            </Link>
          </li>
        </ul>
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

      <ToDoList lanes={lanes} />
    </div>
  );
}
