import Link from "next/link";
import { Check, Layers, Lock, X } from "lucide-react";
import { cn } from "cn";
import { groupByUnit } from "@/lib/practice-groups";
import type { NeededTarget, StudentPractice } from "@/lib/queries/practice";
import { EmptyState } from "@/components/empty-state";
import { TargetChip } from "@/components/targets/target-chip";
import { ActivityCard, PracticeSetCard } from "./practice-cards";

/**
 * The student's Practice tab (PLAN.md §5 screen 2): "Needed before your
 * retake" first, with a three-item checklist per target, then everything
 * published on their courses, always open, in the teacher's order.
 */
export function PracticeTab({ practice }: { practice: StudentPractice }) {
  const { needed, sets, activities } = practice;
  const items = [
    ...activities.map((a) => ({ kind: "activity" as const, sortOrder: a.sortOrder, item: a })),
    ...sets.map((s) => ({ kind: "set" as const, sortOrder: s.sortOrder, item: s })),
  ].sort((a, b) => a.sortOrder - b.sortOrder || a.item.title.localeCompare(b.item.title));
  const byCourse = new Map<string, typeof items>();
  for (const it of items) {
    const key = it.item.courseName ?? "Practice";
    byCourse.set(key, [...(byCourse.get(key) ?? []), it]);
  }

  return (
    <div className="flex flex-col gap-5">
      {needed.map((g) => (
        <section
          key={g.assignmentId}
          className="rounded-lg border border-coral/40 bg-card"
          aria-label={`Needed before your retake · ${g.title}`}
          data-needed={g.assignmentId}
        >
          <h2 className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-sm font-medium">
            <Lock className="size-4 text-[#B93E27]" aria-hidden />
            Needed before your retake
            <span className="font-normal text-muted-foreground">· {g.title}</span>
          </h2>
          <ul className="divide-y divide-border">
            {g.targets.map((t) => (
              <NeededRow key={t.id} t={t} />
            ))}
          </ul>
        </section>
      ))}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={Layers}
            title="Practice is always open"
            description="Practice sets and relearning activities never count against you. Your teacher hasn't published any yet."
          />
        </div>
      ) : (
        [...byCourse].map(([course, list]) => {
          const units = groupByUnit(list.map((it) => ({ ...it, targets: it.item.targets })));
          return (
            <section key={course} className="flex flex-col gap-3" aria-label={course}>
              <h2 className="text-sm font-medium text-muted-foreground">{course} · always open</h2>
              {/* One header per unit, like Google Classroom topics (Jon, Oct 2 2026). */}
              {units.map((u) => (
                <section
                  key={u.id}
                  className="flex flex-col gap-2"
                  aria-label={u.name}
                  data-unit-group={u.id}
                >
                  <h3 className="flex items-center gap-2 border-b border-border pb-1 text-base font-medium">
                    {u.name}
                    <span className="text-xs font-normal text-muted-foreground tabular">
                      · {u.items.length} {u.items.length === 1 ? "item" : "items"}
                    </span>
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {u.items.map((it) =>
                      it.kind === "activity" ? (
                        <ActivityCard key={`a:${it.item.id}`} a={it.item} />
                      ) : (
                        <PracticeSetCard key={`s:${it.item.id}`} s={it.item} />
                      )
                    )}
                  </ul>
                </section>
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}

function NeededRow({ t }: { t: NeededTarget }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3" data-needed-target={t.code}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <TargetChip
          code={t.code}
          title={t.title}
          percent={t.percent}
          tone={t.required ? "required" : "optional"}
        />
        <span className="ml-auto flex flex-wrap items-center gap-x-3 text-xs tabular">
          <Gate label="corrections" ok={t.correctionsOk} href={t.correctionsHref} />
          <Gate label="activity" ok={t.activityOk} />
          <Gate label="practice" ok={t.practiceOk} />
        </span>
      </div>
      {!t.activityOk || !t.practiceOk ? (
        <ul className="flex flex-col gap-2">
          {!t.activityOk
            ? t.activities.map((a) => <ActivityCard key={`a:${a.id}`} a={a} compact />)
            : null}
          {!t.practiceOk
            ? t.sets.map((s) => <PracticeSetCard key={`s:${s.id}`} s={s} compact />)
            : null}
          {!t.activityOk && t.activities.length === 0 ? (
            <li className="text-xs text-muted-foreground">
              No activity is published for {t.code} yet. Ask your teacher.
            </li>
          ) : null}
          {!t.practiceOk && t.sets.length === 0 ? (
            <li className="text-xs text-muted-foreground">
              No practice set is published for {t.code} yet. Ask your teacher.
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

function Gate({ label, ok, href }: { label: string; ok: boolean; href?: string | null }) {
  const body = (
    <>
      {label}
      {ok ? (
        <Check className="size-3.5" aria-label="done" />
      ) : (
        <X className="size-3.5" aria-label="not yet" />
      )}
    </>
  );
  const cls = cn(
    "inline-flex items-center gap-0.5",
    ok ? "text-success-foreground" : "text-muted-foreground"
  );
  return href && !ok ? (
    <Link href={href} className={cn(cls, "underline-offset-2 hover:underline")}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}
