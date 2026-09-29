import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, FileSpreadsheet } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { getCurrentCourse } from "@/lib/current-course";
import { listTargets } from "@/lib/queries/courses";
import { listWorksheets } from "@/lib/queries/worksheets";
import { COUNTS_AS_LABEL } from "@/lib/worksheet-rules";
import { EmptyState } from "@/components/empty-state";
import { LocalTime } from "@/components/local-time";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { RegisterDialog } from "./register-dialog";

export const metadata: Metadata = { title: "Worksheets" };

/** The worksheet registry (PLAN.md §3.7a): what each Apps Script worksheet counts as, and what has come in. */
export default async function WorksheetsPage() {
  const session = await requireTeacher();
  const [worksheets, { courses, current }] = await Promise.all([
    listWorksheets(session.userId),
    getCurrentCourse(session.userId),
  ]);
  const targetsByCourse = Object.fromEntries(
    await Promise.all(
      courses.map(async (c) => [
        c.id,
        (await listTargets(c.id)).map((t) => ({ id: t.id, code: t.code, title: t.title })),
      ])
    )
  ) as Record<string, { id: string; code: string; title: string }[]>;
  const dialogProps = { courses, targetsByCourse, defaultCourseId: current?.id ?? null };
  const unregistered = worksheets.filter((w) => !w.registered);
  const registered = worksheets.filter((w) => w.registered);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <Link
            href="/app/practice"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden /> Practice sets
          </Link>
          <h1 className="mt-2 text-2xl">Worksheets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your Apps Script worksheets, registered as practice sets or relearning activities. A
            final submit on the worksheet completes it here within seconds, verified by the
            worksheet itself.
          </p>
        </div>
        <RegisterDialog {...dialogProps} />
      </div>

      {unregistered.length > 0 ? (
        <section
          className="rounded-lg border border-warning/40 bg-card"
          aria-label="Needs registering"
        >
          <h2 className="border-b border-border px-4 py-2 text-sm font-medium">
            Heard from, not registered yet
          </h2>
          <ul className="divide-y divide-border">
            {unregistered.map((w) => (
              <li
                key={w.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                data-worksheet={w.id}
              >
                <div className="mr-auto min-w-0">
                  <p className="font-medium">{w.title ?? "Untitled worksheet"}</p>
                  <p className="text-xs text-muted-foreground tabular">
                    script {w.scriptId.slice(0, 12)}… · {w.submits}{" "}
                    {w.submits === 1 ? "submit" : "submits"}
                    {w.unmatched
                      ? ` · ${w.unmatched} unmatched ${w.unmatched === 1 ? "email" : "emails"}`
                      : ""}
                    {w.lastEventAt ? (
                      <>
                        {" · last "}
                        <LocalTime date={w.lastEventAt} />
                      </>
                    ) : null}
                  </p>
                </div>
                <RegisterDialog
                  {...dialogProps}
                  prefill={{ ref: w.scriptId, title: w.title ?? "" }}
                  label="Register"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {registered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={FileSpreadsheet}
            title="No worksheets registered"
            description="Paste a worksheet's student link or script id, say what it counts as, and tag its targets. Then add the Bloom block to its Code.gs and redeploy."
            action={<RegisterDialog {...dialogProps} label="Register a worksheet" />}
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Registered worksheets">
          {registered.map((w) => (
            <li
              key={w.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
              data-worksheet={w.id}
            >
              <FileSpreadsheet className="size-5 shrink-0 text-brand-deep" aria-hidden />
              <div className="mr-auto min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/app/practice/worksheets/${w.id}`}
                    className="font-medium hover:underline"
                  >
                    {w.title ?? "Untitled worksheet"}
                  </Link>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {COUNTS_AS_LABEL[w.countsAs]}
                  </span>
                  {w.scriptId.startsWith("pending:") ? (
                    <span className="rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-foreground">
                      Waiting for first submit
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground tabular">
                  <span>{w.courseName ?? "No course"}</span>
                  {w.targets.map((t) => (
                    <TargetChip key={t.id} code={t.code} title={t.title} className="h-5" />
                  ))}
                  <span>
                    · {w.submits} {w.submits === 1 ? "submit" : "submits"} · {w.students}{" "}
                    {w.students === 1 ? "student" : "students"}
                  </span>
                  {w.unmatched ? (
                    <span className="text-warning-foreground">
                      · {w.unmatched} unmatched {w.unmatched === 1 ? "email" : "emails"}
                    </span>
                  ) : null}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/app/practice/worksheets/${w.id}`} />}
              >
                Open
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
