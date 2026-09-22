import type { Metadata } from "next";
import Link from "next/link";
import { Library } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { getCurrentCourse } from "@/lib/current-course";
import { listMyBanks } from "@/lib/queries/banks";
import { EmptyState } from "@/components/empty-state";
import { NewBankDialog } from "./new-bank-dialog";

export const metadata: Metadata = { title: "Question banks" };

export default async function BanksPage({ searchParams }: PageProps<"/app/banks">) {
  const session = await requireTeacher();
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const [banks, { courses, current }] = await Promise.all([
    listMyBanks(session.userId, showArchived),
    getCurrentCourse(session.userId),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl">Question banks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Write a question once, reuse it forever. Import a CSV or add questions by hand.
          </p>
        </div>
        <Link
          href={showArchived ? "/app/banks" : "/app/banks?archived=1"}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
        <NewBankDialog courses={courses} defaultCourseId={current?.id ?? null} />
      </div>

      {banks.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Library}
            title="No banks yet"
            description="Create a bank for a course, then import your CSV or add questions one at a time."
            action={
              <NewBankDialog
                courses={courses}
                defaultCourseId={current?.id ?? null}
                label="Create a bank"
              />
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {banks.map((b) => (
            <li key={b.id}>
              <Link
                href={`/app/banks/${b.id}`}
                className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors outline-none hover:border-brand/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base leading-tight">{b.name}</h2>
                  {b.isArchived ? (
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Archived
                    </span>
                  ) : b.sharedWith > 0 ? (
                    <span className="shrink-0 rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
                      Shared · {b.sharedWith}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Private
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {b.courseName ?? "No course"}
                  {b.description ? ` · ${b.description}` : ""}
                </p>
                <p className="mt-auto text-xs text-muted-foreground tabular">
                  {b.questions} {b.questions === 1 ? "question" : "questions"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
