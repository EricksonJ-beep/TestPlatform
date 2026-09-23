import Link from "next/link";
import { BarChart3, ClipboardList, Layers, Plus } from "lucide-react";
import { requireStudent } from "@/lib/authz";
import { listStudentAssignments } from "@/lib/queries/assignments";
import { listStudentClasses } from "@/lib/queries/classes";
import { EmptyState } from "@/components/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignmentCard } from "./assignment-card";

export default async function StudentHome() {
  const session = await requireStudent();
  const [classes, assignments] = await Promise.all([
    listStudentClasses(session.userId),
    listStudentAssignments(session.userId),
  ]);
  // Things needing action: open assignments not yet started or still in progress.
  const attention = assignments.filter(
    (a) => a.state === "not_started" || a.state === "in_progress"
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
          <div className="rounded-lg border border-border bg-card">
            <EmptyState
              icon={Layers}
              title="Practice is always open"
              description="Practice sets and relearning activities never count against you. Your teacher hasn't published any yet."
            />
          </div>
        </TabsContent>

        <TabsContent value="results">
          <div className="rounded-lg border border-border bg-card">
            <EmptyState
              icon={BarChart3}
              title="No results yet"
              description="After you finish something, every attempt lands here. Your highest score always counts."
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
