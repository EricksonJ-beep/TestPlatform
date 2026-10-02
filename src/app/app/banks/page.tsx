import type { Metadata } from "next";
import Link from "next/link";
import { Library } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { getCurrentCourse } from "@/lib/current-course";
import { listMyBanks } from "@/lib/queries/banks";
import { listUnitsForTeacher } from "@/lib/queries/courses";
import { groupByUnit } from "@/lib/unit-shelves";
import { EmptyState } from "@/components/empty-state";
import { UnitBoard } from "@/components/app/unit-board";
import { placeBank } from "./actions";
import { NewBankDialog } from "./new-bank-dialog";

export const metadata: Metadata = { title: "Question banks" };

export default async function BanksPage({ searchParams }: PageProps<"/app/banks">) {
  const session = await requireTeacher();
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const [banks, units, { courses, current }] = await Promise.all([
    listMyBanks(session.userId, showArchived),
    listUnitsForTeacher(session.userId),
    getCurrentCourse(session.userId),
  ]);
  // Cards render here (server) and the board only moves them around.
  const shelves = groupByUnit(
    banks.map((b) => ({
      ...b,
      node: (
        <Link
          href={`/app/banks/${b.id}`}
          draggable={false}
          className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 pl-9 transition-colors outline-none hover:border-brand/50 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base leading-tight">{b.name}</h3>
            {b.isArchived ? (
              <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Archived
              </span>
            ) : b.sharedWith > 0 ? (
              <span className="shrink-0 rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
                Shared · {b.sharedWith}
              </span>
            ) : null}
          </div>
          {b.description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{b.description}</p>
          ) : null}
          <p className="mt-auto text-xs text-muted-foreground tabular">
            {b.questions} {b.questions === 1 ? "question" : "questions"}
          </p>
        </Link>
      ),
    })),
    units
  );

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
        <UnitBoard courses={shelves} noun="bank" place={placeBank} />
      )}
    </div>
  );
}
