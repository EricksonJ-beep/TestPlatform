import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Library, Share2 } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { getCurrentCourse } from "@/lib/current-course";
import { listBanksSharedWithMe } from "@/lib/queries/banks";
import { listAssessmentsSharedWithMe } from "@/lib/queries/shares";
import { EmptyState } from "@/components/empty-state";
import { CopyToMine } from "./copy-to-mine";

export const metadata: Metadata = { title: "Shared with me" };

const PERMISSION_LABEL = { view: "Can view", copy: "Can copy", co_edit: "Can co-edit" } as const;

/** Banks and assessments other teachers shared with you. Private ones never appear (PLAN.md §3.12). */
export default async function SharedPage() {
  const session = await requireTeacher();
  const [banks, assessments, { courses, current }] = await Promise.all([
    listBanksSharedWithMe(session.userId),
    listAssessmentsSharedWithMe(session.userId),
    getCurrentCourse(session.userId),
  ]);
  const courseOptions = courses.map((c) => ({ id: c.id, name: c.name }));
  const defaultCourseId = current?.id ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-2xl">Shared with me</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Banks and assessments a colleague shared with you, with the access they granted. Copy
          anything you can copy onto one of your own courses to make it yours.
        </p>
      </div>

      {banks.length === 0 && assessments.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Share2}
            title="Nothing shared yet"
            description="When a colleague shares a bank or an assessment with you, it shows up here."
          />
        </div>
      ) : null}

      {banks.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Shared banks">
          <h2 className="flex items-center gap-2 text-lg">
            <Library className="size-4 text-muted-foreground" aria-hidden /> Question banks
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {banks.map((b) => (
              <li
                key={b.id}
                className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4"
                data-shared-bank={b.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/app/banks/${b.id}`}
                    className="text-base leading-tight hover:underline"
                  >
                    {b.name}
                  </Link>
                  <span className="shrink-0 rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
                    {PERMISSION_LABEL[b.permission]}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  From {b.ownerFirstName} {b.ownerLastName}
                  {b.description ? ` · ${b.description}` : ""}
                </p>
                <p className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular">
                  <span className="mr-auto">
                    {b.questions} {b.questions === 1 ? "question" : "questions"}
                  </span>
                  {b.permission !== "view" ? (
                    <CopyToMine
                      kind="bank"
                      id={b.id}
                      courses={courseOptions}
                      defaultCourseId={defaultCourseId}
                    />
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {assessments.length > 0 ? (
        <section className="flex flex-col gap-3" aria-label="Shared assessments">
          <h2 className="flex items-center gap-2 text-lg">
            <ClipboardList className="size-4 text-muted-foreground" aria-hidden /> Assessments
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assessments.map((a) => (
              <li
                key={a.id}
                className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4"
                data-shared-assessment={a.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/app/assessments/${a.id}`}
                    className="text-base leading-tight hover:underline"
                  >
                    {a.title}
                  </Link>
                  <span className="shrink-0 rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
                    {PERMISSION_LABEL[a.permission]}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  From {a.ownerFirstName} {a.ownerLastName} · {a.type}
                  {a.courseName ? ` · ${a.courseName}` : ""}
                </p>
                <p className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular">
                  <span className="mr-auto">
                    {a.sections} {a.sections === 1 ? "section" : "sections"} ·{" "}
                    {a.isPublished ? "published" : "draft"}
                  </span>
                  {a.permission !== "view" ? (
                    <CopyToMine
                      kind="assessment"
                      id={a.id}
                      courses={courseOptions}
                      defaultCourseId={defaultCourseId}
                    />
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
