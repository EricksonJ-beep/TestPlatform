import Link from "next/link";
import { Check, Layers, Lock, Shuffle, X } from "lucide-react";
import { cn } from "cn";
import { groupByUnit } from "@/lib/practice-groups";
import type { CustomPracticeCourse } from "@/lib/custom-practice";
import { PRACTICE_PASS_PERCENT, practiceSizeText } from "@/lib/quiz-practice";
import type { NeededTarget, QuizNeededTarget, StudentPractice } from "@/lib/queries/practice";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { TargetChip } from "@/components/targets/target-chip";
import { ActivityCard, PracticeSetCard } from "./practice-cards";

/**
 * The student's Practice tab (PLAN.md §5 screen 2): "Needed before your
 * retake" first, for tests open to the student (Jon, Oct 14 2026): a
 * summative's three-item checklist per target, and a quiz's missed targets to
 * practise to 80% (R3); then everything published on their courses, always
 * open, in the teacher's order.
 */
export function PracticeTab({
  practice,
  buildable = [],
}: {
  practice: StudentPractice;
  /** Courses with questions open for "Build my practice" (Jon, Oct 13 2026). */
  buildable?: CustomPracticeCourse[];
}) {
  const { needed, quizNeeded, sets, activities } = practice;
  const canBuild = new Set(
    buildable.flatMap((c) => c.units.flatMap((u) => u.targets.map((t) => t.id)))
  );
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
          id={`needed-${g.assignmentId}`}
          className="scroll-mt-16 rounded-lg border border-coral/40 bg-card"
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

      {quizNeeded.map((g) => (
        <section
          key={g.assignmentId}
          id={`needed-${g.assignmentId}`}
          className="scroll-mt-16 rounded-lg border border-coral/40 bg-card"
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
              <QuizNeededRow key={t.id} t={t} canBuild={canBuild.has(t.id)} />
            ))}
          </ul>
        </section>
      ))}

      {buildable.map((c) => (
        <BuildCard key={c.id} course={c} />
      ))}

      {items.length === 0 && buildable.length > 0 ? null : items.length === 0 ? (
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

/** "Build my practice": pick a unit and targets, get a fresh set every time. */
function BuildCard({ course }: { course: CustomPracticeCourse }) {
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-card px-4 py-4"
      aria-label={`Build my practice · ${course.name}`}
      data-build-card={course.id}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Shuffle className="size-5 text-brand-deep" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-base font-medium">Build my practice · {course.name}</h2>
          <p className="text-sm text-muted-foreground">
            Pick a unit and the learning targets you want. New questions every time.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href={`/student/practice/build?course=${course.id}`} />}
        >
          Build practice
        </Button>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Jump to a unit">
        {course.units.map((u) => (
          <li key={u.id ?? "other"}>
            <Link
              href={`/student/practice/build?course=${course.id}${u.id ? `&unit=${u.id}` : ""}`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {u.name}
              <span className="tabular">· {u.targets.length}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A quiz's missed target (R3): score 80% on a practice of it, Build my practice (opened on the
 * target) or a teacher's set tagged to it.
 */
function QuizNeededRow({ t, canBuild }: { t: QuizNeededTarget; canBuild: boolean }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3" data-needed-target={t.code}>
      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <TargetChip code={t.code} title={t.title} percent={t.scored} tone="required" />
          <span className="text-muted-foreground tabular">
            Score {PRACTICE_PASS_PERCENT}% {practiceSizeText(t.minQuestions)}
            {t.best !== null ? ` · best so far ${Math.round(t.best)}%` : ""}
          </span>
        </div>
        {canBuild ? (
          <Button
            className="h-11 w-full sm:h-8 sm:w-auto"
            aria-label={`Build practice on ${t.code}`}
            nativeButton={false}
            render={<Link href={`/student/practice/build?target=${t.id}`} />}
          >
            Build practice
          </Button>
        ) : null}
      </div>
      {t.sets.length ? (
        <ul className="flex flex-col gap-2">
          {t.sets.map((s) => (
            <PracticeSetCard key={`s:${s.id}`} s={s} compact />
          ))}
        </ul>
      ) : null}
    </li>
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
