import { BarChart3, ClipboardList, Layers } from "lucide-react";
import { requireStudent } from "@/lib/authz";
import { listStudentClasses } from "@/lib/queries/classes";
import { EmptyState } from "@/components/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function StudentHome() {
  const session = await requireStudent();
  const classes = await listStudentClasses(session.userId);
  const attention = 0; // Phase 1: count of assignments needing action

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl">Hi, {session.firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {attention === 0
            ? "Nothing needs your attention right now."
            : `${attention} ${attention === 1 ? "thing needs" : "things need"} your attention.`}
        </p>
        {classes.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your classes">
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
          <div className="rounded-lg border border-border bg-card">
            <EmptyState
              icon={ClipboardList}
              title="No assignments yet"
              description="When your teacher opens a quiz or test for your class, it shows up here with a Start button."
            />
          </div>
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
