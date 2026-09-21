import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { listClasses } from "@/lib/queries/classes";
import { EmptyState } from "@/components/empty-state";
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
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/classes/${c.id}`}
                className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors outline-none hover:border-brand/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base leading-tight">{c.name}</h2>
                  {c.period ? (
                    <span className="shrink-0 rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
                      P{c.period}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {[c.courseName, c.term].filter(Boolean).join(" · ") || "No course set"}
                </p>
                <p className="mt-auto text-xs text-muted-foreground tabular">
                  {c.students} {c.students === 1 ? "student" : "students"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
