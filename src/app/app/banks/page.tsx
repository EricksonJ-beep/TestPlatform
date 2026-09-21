import type { Metadata } from "next";
import { Library } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { listMyBanks } from "@/lib/queries/banks";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Question banks" };

/** Phase 0: the list of banks you own. Authoring, filters, and import arrive in Phase 1. */
export default async function BanksPage() {
  const session = await requireTeacher();
  const banks = await listMyBanks(session.userId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-2xl">Question banks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your banks. Authoring, tags, pools, and CSV import land in Phase 1.
        </p>
      </div>
      {banks.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Library}
            title="No banks yet"
            description="Banks are created in Phase 1, or by the seed script for now."
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {banks.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base leading-tight">{b.name}</h2>
                {b.sharedWith > 0 ? (
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
                {b.description ?? b.courseName ?? "—"}
              </p>
              <p className="mt-auto text-xs text-muted-foreground tabular">
                {b.questions} {b.questions === 1 ? "question" : "questions"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
