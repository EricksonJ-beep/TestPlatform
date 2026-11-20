"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Settings2 } from "lucide-react";
import { cn } from "cn";
import type { ActionResult } from "@/lib/authz";
import { sectionListPath } from "@/lib/course-focus";

export type CourseOption = { id: string; name: string };

/**
 * Dot colors, by position in the list, so each course is easy to spot (like Google Classroom).
 * The first was coral; the redesign's shell carries no coral, so it is the deep pink.
 */
const CHIP_COLORS = [
  "bg-eosin-deep",
  "bg-sky-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-lime-600",
  "bg-rose-500",
  "bg-cyan-600",
  "bg-orange-500",
];

/**
 * The course the teacher is focused on, at the top of the sidebar (Jon, Oct 6
 * 2026: "toggle between classes and focus on each class at one time… like
 * Google Classroom"). Every course is listed on its own row, not tucked in a
 * dropdown (Jon, Oct 14 2026: "like Google Classroom's side tab"). Picking one
 * remembers it and lands on the same section's list for that course; the
 * Dashboard and other global pages stay.
 */
export function CourseSwitcher({
  courses,
  current,
  collapsed,
  pick,
}: {
  courses: CourseOption[];
  current: CourseOption | null;
  collapsed: boolean;
  pick: (courseId: string | null) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  // Highlights the row just clicked while the switch is in flight.
  const [picking, setPicking] = useState<string | null>(null);
  if (courses.length === 0) return null;

  function choose(id: string) {
    if (id === current?.id) return;
    setPicking(id);
    start(async () => {
      const r = await pick(id);
      setPicking(null);
      if (!r.ok) return;
      const next = sectionListPath(pathname);
      if (next !== pathname) router.push(next);
      router.refresh();
    });
  }

  const onCourses = pathname === "/app/courses" || pathname.startsWith("/app/courses/");
  const shownId = picking ?? current?.id ?? null;
  // The focused course is bold on a violet wash; the current page is white on ink, so "which
  // course" and "which page" never look like the same thing.
  const rowClass = (active: boolean) =>
    cn(
      "flex h-11 items-center gap-2.5 rounded-[10px] px-3 text-left text-[15px] md:h-10 md:w-full",
      active ? "bg-stain-wash font-bold text-ink" : "font-medium text-ink hover:bg-stain-wash",
      collapsed && "md:justify-center md:px-0"
    );
  const labelClass = cn("min-w-0 truncate", collapsed && "md:sr-only");

  return (
    <div
      role="group"
      aria-labelledby="course-list-heading"
      data-course-switcher
      data-pending={pending || undefined}
      className="flex flex-row flex-wrap gap-1 md:flex-col md:flex-nowrap"
    >
      <h2
        id="course-list-heading"
        className={cn(
          "w-full px-3 pb-0.5 font-body text-[13px] font-semibold tracking-normal text-ink-muted",
          collapsed && "md:sr-only"
        )}
      >
        Courses
      </h2>
      {courses.map((c, i) => {
        const active = c.id === shownId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => choose(c.id)}
            aria-current={active ? "true" : undefined}
            title={c.name}
            data-course-option={c.id}
            className={cn(rowClass(active), pending && picking === c.id && "opacity-70")}
          >
            <span
              aria-hidden
              className={cn("size-2.5 shrink-0 rounded-full", CHIP_COLORS[i % CHIP_COLORS.length])}
            />
            <span className={labelClass}>{c.name}</span>
          </button>
        );
      })}
      <Link
        href="/app/courses"
        title="Manage courses"
        aria-current={onCourses ? "page" : undefined}
        className={cn(rowClass(false), onCourses && "bg-ink text-white hover:bg-ink")}
      >
        <Settings2
          className={cn("size-4 shrink-0", onCourses ? "text-white" : "text-ink-muted")}
          aria-hidden
        />
        <span className={cn(labelClass, !onCourses && "text-ink-muted")}>Manage courses</span>
      </Link>
    </div>
  );
}
