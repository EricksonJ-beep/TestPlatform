import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, PencilLine, Plus, Users } from "lucide-react";
import { cn } from "cn";
import { requireTeacher } from "@/lib/authz";
import { getCurrentCourse } from "@/lib/current-course";
import {
  listRelearningGrid,
  type OptionCell,
  type TargetRow,
} from "@/lib/queries/relearning-options";
import { MODE_EMOJI, MODE_LABEL, MODES, type RelearningMode } from "@/lib/relearning";
import { FollowCourse } from "@/components/app/course-focus";

export const metadata: Metadata = { title: "Read · Watch · Do" };

/**
 * Read · Watch · Do per target (relearning revamp "Activity builder", Nov 5 2026): the course in
 * focus, one row per learning target, a cell per mode. A built option opens the editor; a
 * missing one is "Add".
 */
export default async function RelearningOptionsPage({
  searchParams,
}: PageProps<"/app/practice/relearning">) {
  const session = await requireTeacher();
  const { course: wanted } = await searchParams;
  const { courses, current } = await getCurrentCourse(session.userId);
  const course = courses.find((c) => c.id === wanted) ?? current;
  const rows = course ? await listRelearningGrid(session.userId, course.id) : [];
  const built = rows.reduce((n, r) => n + Object.keys(r.options).length, 0);
  const units = groupByUnit(rows);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <FollowCourse courseId={course?.id} />
      <div>
        <Link
          href="/app/practice"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> Practice sets
        </Link>
        <h1 className="mt-2 text-2xl">Read · Watch · Do</h1>
        <p className="mt-1 text-sm text-muted-foreground tabular" data-grid-summary>
          {course ? (
            <>
              {course.name} · {rows.length} {rows.length === 1 ? "target" : "targets"} · {built} of{" "}
              {rows.length * 3} built
            </>
          ) : (
            "Make a course first."
          )}
        </p>
      </div>
      {courses.length > 1 ? (
        <nav className="flex flex-wrap gap-1.5 text-sm" aria-label="Course">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/app/practice/relearning?course=${c.id}`}
              aria-current={c.id === course?.id ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-md border px-3",
                c.id === course?.id
                  ? "border-brand bg-brand-soft font-medium text-brand-deep"
                  : "border-border bg-card hover:bg-muted/50"
              )}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      ) : null}
      {course && rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          This course has no learning targets yet.{" "}
          <Link href={`/app/courses/${course.id}`} className="text-brand-deep hover:underline">
            Add them on the course page.
          </Link>
        </p>
      ) : null}
      {rows.length ? (
        <div
          className="overflow-hidden rounded-lg border border-border bg-card"
          data-relearning-grid
        >
          <div
            className="hidden grid-cols-[minmax(13rem,1.1fr)_repeat(3,minmax(0,1fr))] border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground sm:grid"
            aria-hidden
          >
            <span className="px-3 py-2">Target</span>
            {MODES.map((m) => (
              <span key={m} className="border-l border-border px-3 py-2">
                {MODE_EMOJI[m]} {MODE_LABEL[m]}
              </span>
            ))}
          </div>
          {units.map((u) => (
            <section key={u.name ?? "none"} aria-label={u.name ?? "No unit"}>
              {units.length > 1 || u.name ? (
                <h2 className="border-b border-border bg-muted/20 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                  {u.name ?? "No unit"}
                </h2>
              ) : null}
              <ul className="divide-y divide-border">
                {u.rows.map((t) => (
                  <li
                    key={t.id}
                    className="grid pb-1.5 sm:grid-cols-[minmax(13rem,1.1fr)_repeat(3,minmax(0,1fr))] sm:pb-0"
                    data-target-row={t.code}
                  >
                    <div className="min-w-0 px-3 pt-2.5 pb-1 sm:py-2.5">
                      <span className="font-medium tabular">{t.code}</span>{" "}
                      <span className="text-sm text-muted-foreground">{t.title}</span>
                    </div>
                    {MODES.map((m) => (
                      <ModeCell
                        key={m}
                        targetId={t.id}
                        code={t.code}
                        mode={m}
                        cell={t.options[m]}
                      />
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
      {rows.length ? (
        <p className="text-xs text-muted-foreground">
          Edits reach students on their next page load and keep their progress. A content pack
          update leaves an option you&apos;ve edited here alone.
        </p>
      ) : null}
    </div>
  );
}

function ModeCell({
  targetId,
  code,
  mode,
  cell,
}: {
  targetId: string;
  code: string;
  mode: RelearningMode;
  cell: OptionCell | undefined;
}) {
  // Phones: one mode per line under the target. Wider: a column per mode.
  const edge = "min-w-0 border-border px-1.5 py-0.5 sm:border-l sm:p-1.5";
  if (!cell)
    return (
      <div className={edge}>
        <Link
          href={`/app/practice/relearning/new?target=${targetId}&mode=${mode}`}
          className="flex h-full min-h-10 items-center gap-1 rounded-md border border-dashed border-border px-2 text-sm text-muted-foreground hover:border-brand hover:bg-brand-soft/40 hover:text-brand-deep sm:min-h-14 sm:justify-center sm:px-0"
          aria-label={`Add ${MODE_LABEL[mode]} for ${code}`}
          data-add-option={`${code}-${mode}`}
        >
          <Plus className="size-4" aria-hidden />
          <span className="sm:hidden">
            {MODE_EMOJI[mode]} {MODE_LABEL[mode]} ·
          </span>{" "}
          Add
        </Link>
      </div>
    );
  const minutes =
    cell.extensionMinutes > 0
      ? `${cell.coreMinutes}+${cell.extensionMinutes} min`
      : `${cell.coreMinutes} min`;
  return (
    <div className={edge}>
      <Link
        href={`/app/practice/relearning/${cell.id}`}
        className="flex h-full min-h-14 flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 hover:bg-muted/60"
        title={cell.description ? `${cell.title} — ${cell.description}` : cell.title}
        data-option={`${code}-${mode}`}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              cell.isPublished ? "bg-success" : "bg-muted-foreground/40"
            )}
            aria-label={cell.isPublished ? "Published" : "Draft"}
          />
          <span className="sm:hidden">{MODE_EMOJI[mode]}</span>
          <span className="truncate">{shortTitle(cell.title)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular">
          <span>{minutes}</span>
          <span>
            {cell.checks} {cell.checks === 1 ? "check" : "checks"}
          </span>
          {!cell.isPublished ? <span className="text-warning-foreground">Draft</span> : null}
          {cell.editedAt ? <PencilLine className="size-3" aria-label="Edited in Bloom" /> : null}
          {cell.inProgress ? (
            <span className="inline-flex items-center gap-0.5" title="Students working on it now">
              <Users className="size-3" aria-hidden />
              {cell.inProgress}
            </span>
          ) : null}
        </span>
      </Link>
    </div>
  );
}

/** The title without the target and mode its column already shows: "U3.LT1 Watch: atoms" → "Atoms". */
function shortTitle(title: string): string {
  const t = title.replace(/^(\S+\s+)?(Read|Watch|Do)\s*[:·-]\s*/i, "").trim() || title;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function groupByUnit(rows: TargetRow[]): { name: string | null; rows: TargetRow[] }[] {
  const out: { name: string | null; rows: TargetRow[] }[] = [];
  for (const r of rows) {
    const last = out.at(-1);
    if (last && last.name === r.unitName) last.rows.push(r);
    else out.push({ name: r.unitName, rows: [r] });
  }
  return out;
}
