import type { Metadata } from "next";
import { Share2 } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { listBanksSharedWithMe } from "@/lib/queries/banks";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Shared with me" };

const PERMISSION_LABEL = { view: "Can view", copy: "Can copy", co_edit: "Can co-edit" } as const;

/** Banks (and later assessments) other teachers have shared with you. Private banks never appear. */
export default async function SharedPage() {
  const session = await requireTeacher();
  const banks = await listBanksSharedWithMe(session.userId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-2xl">Shared with me</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Banks a colleague shared with you, with the access they granted.
        </p>
      </div>
      {banks.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Share2}
            title="Nothing shared yet"
            description="When a colleague shares a bank with you, it shows up here."
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
                <span className="shrink-0 rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
                  {PERMISSION_LABEL[b.permission]}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                From {b.ownerFirstName} {b.ownerLastName}
                {b.description ? ` · ${b.description}` : ""}
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
