import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { listClasses } from "@/lib/queries/classes";
import { EmptyState } from "@/components/empty-state";
import { ClassGrid } from "./class-grid";
import { NewClassDialog } from "./new-class-dialog";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage() {
  const session = await requireTeacher();
  const classes = await listClasses(session.userId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl">Classes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rosters, student accounts, and password resets.
          </p>
        </div>
        <NewClassDialog />
      </div>

      {classes.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Users}
            title="No classes yet"
            description="Create your first class, then add students one at a time or upload a roster CSV."
            action={<NewClassDialog label="Create a class" />}
          />
        </div>
      ) : (
        <ClassGrid classes={classes} />
      )}
    </div>
  );
}
