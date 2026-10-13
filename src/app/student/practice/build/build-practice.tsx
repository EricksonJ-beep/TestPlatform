"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import type { CustomPracticeCourse } from "@/lib/custom-practice";
import { CUSTOM_PRACTICE_SIZES, DEFAULT_CUSTOM_PRACTICE_SIZE } from "@/lib/custom-practice-rules";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { startBuiltPractice } from "../actions";

/**
 * Pick a course (when there is more than one), a unit, the targets ("All of
 * Unit 2" or any of its targets), and how many questions. Start deals a new
 * hand and opens the practice screen.
 */
export function BuildPractice({
  courses,
  initialCourseId,
  initialUnitId,
}: {
  courses: CustomPracticeCourse[];
  initialCourseId: string | null;
  initialUnitId: string | null;
}) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(
    courses.find((c) => c.id === initialCourseId)?.id ?? courses[0].id
  );
  const course = courses.find((c) => c.id === courseId) ?? courses[0];
  const [unitKey, setUnitKey] = useState<string>(
    String(course.units.find((u) => u.id === initialUnitId)?.id ?? course.units[0]?.id ?? "")
  );
  const unit = course.units.find((u) => String(u.id ?? "") === unitKey) ?? course.units[0];
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState<number>(DEFAULT_CUSTOM_PRACTICE_SIZE);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = useMemo(
    () => (unit ? unit.targets.filter((t) => picked.has(t.id)) : []),
    [unit, picked]
  );
  const available = chosen.reduce((n, t) => n + t.available, 0);
  const allPicked = !!unit && unit.targets.length > 0 && chosen.length === unit.targets.length;

  function pickCourse(id: string) {
    setCourseId(id);
    const next = courses.find((c) => c.id === id);
    setUnitKey(String(next?.units[0]?.id ?? ""));
    setPicked(new Set());
  }
  function pickUnit(key: string) {
    setUnitKey(key);
    setPicked(new Set());
  }
  function toggle(id: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleAll(on: boolean) {
    setPicked(on && unit ? new Set(unit.targets.map((t) => t.id)) : new Set());
  }

  async function start() {
    if (chosen.length === 0) return;
    setPending(true);
    setError(null);
    const r = await startBuiltPractice({
      courseId: course.id,
      targetIds: chosen.map((t) => t.id),
      count,
    });
    if (r.ok) router.push(`/student/practice/${r.data.attemptId}`);
    else {
      setPending(false);
      setError(r.error);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-build-practice>
      {courses.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Course</legend>
          <div className="flex flex-wrap gap-2">
            {courses.map((c) => (
              <Chip key={c.id} on={c.id === course.id} onClick={() => pickCourse(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">1. Unit</legend>
        <div className="flex flex-wrap gap-2" data-units>
          {course.units.map((u) => {
            const key = String(u.id ?? "");
            return (
              <Chip key={key} on={key === String(unit?.id ?? "")} onClick={() => pickUnit(key)}>
                {u.name}
              </Chip>
            );
          })}
        </div>
      </fieldset>

      {unit ? (
        <fieldset className="rounded-lg border border-border bg-card">
          <legend className="sr-only">2. Learning targets</legend>
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
            <span className="text-sm font-medium">2. Learning targets</span>
            <span className="text-xs text-muted-foreground tabular">
              {chosen.length} of {unit.targets.length} picked
            </span>
          </div>
          <label
            className="flex cursor-pointer items-center gap-3 border-b border-border bg-muted/40 px-4 py-3 text-sm font-medium"
            data-all-targets
          >
            <Checkbox
              checked={allPicked}
              onCheckedChange={(on) => toggleAll(!!on)}
            />
            All of {unit.name}
          </label>
          <ul className="divide-y divide-border">
            {unit.targets.map((t) => (
              <li key={t.id}>
                <label
                  className="flex cursor-pointer items-start gap-3 px-4 py-3 text-sm"
                  data-target={t.code}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={picked.has(t.id)}
                    onCheckedChange={(on) => toggle(t.id, !!on)}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span>
                      <span className="font-medium tabular">{t.code}</span> · {t.title}
                    </span>
                    <span className="text-xs text-muted-foreground tabular">
                      {t.available} {t.available === 1 ? "question" : "questions"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">3. How many questions?</legend>
        <div className="flex flex-wrap gap-2">
          {CUSTOM_PRACTICE_SIZES.map((n) => (
            <Chip key={n} on={n === count} onClick={() => setCount(n)}>
              {n}
            </Chip>
          ))}
        </div>
        {chosen.length > 0 && available < count ? (
          <p className="text-xs text-muted-foreground">
            Those targets have {available} {available === 1 ? "question" : "questions"}, so you
            will get all of them.
          </p>
        ) : null}
      </fieldset>

      {error ? (
        <p role="alert" className="rounded-lg bg-error-soft px-4 py-2 text-sm text-error-foreground">
          {error}
        </p>
      ) : null}
      <div>
        <Button size="lg" onClick={() => void start()} disabled={pending || chosen.length === 0}>
          {pending
            ? "Building…"
            : chosen.length === 0
              ? "Pick at least one target"
              : `Start practice · ${Math.min(count, available)} questions`}
        </Button>
      </div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm transition-colors",
        on
          ? "border-brand bg-brand-soft font-medium text-brand-deep"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
