import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { requireStudent } from "@/lib/authz";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { listStudentClasses } from "@/lib/queries/classes";
import { getStudentPractice } from "@/lib/queries/practice";
import { listStudentResults } from "@/lib/queries/student-results";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { KeyRound } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignmentCard } from "./assignment-card";
import { PracticeTab } from "./practice-tab";
import { ResultsTab } from "./results-tab";

export default async function StudentHome() {
  const session = await requireStudent();
  const [classes, assignments] = await Promise.all([
    listStudentClasses(session.userId),
    listStudentAssignments(session.userId),
  ]);
  const [practice, results, me] = await Promise.all([
    getStudentPractice(session.userId, assignments),
    listStudentResults(session.userId, assignments),
    db.query.users.findFirst({
      columns: { mustChangePassword: true },
      where: eq(schema.users.id, session.userId),
    }),
  ]);
  // Things needing action: open assignments not started, in progress, or waiting on corrections.
  const attention = assignments.filter(
    (a) =>
      a.state === "not_started" ||
      a.state === "in_progress" ||
      a.state === "corrections_needed" ||
      a.state === "corrections_returned" ||
      a.state === "relearning" ||
      a.state === "retake_required"
  ).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl">Hi, {session.firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {attention === 0
            ? "Nothing needs your attention right now."
            : `${attention} ${attention === 1 ? "thing needs" : "things need"} your attention.`}
        </p>
        <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label="Your classes">
          <li className="hidden" aria-hidden />
          <li>
            <Link
              href="/student/join"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3" aria-hidden /> Join a class
            </Link>
          </li>
        </ul>
        {classes.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Enrolled classes">
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
          </ul>
        ) : null}
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

      <Tabs defaultValue="assignments">
        <TabsList className="w-full justify-start sm:w-auto">
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="practice">Practice</TabsTrigger>
          <TabsTrigger value="results">My results</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments">
          {assignments.length === 0 ? (
            <div className="rounded-lg border border-border bg-card">
              <EmptyState
                icon={ClipboardList}
                title="No assignments yet"
                description="When your teacher opens a quiz or test for your class, it shows up here with a Start button."
              />
            </div>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Assignments">
              {assignments.map((a) => (
                <AssignmentCard key={a.id} a={a} />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="practice">
          <PracticeTab practice={practice} />
        </TabsContent>

        <TabsContent value="results">
          <ResultsTab results={results} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
