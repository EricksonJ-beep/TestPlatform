"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Settings2 } from "lucide-react";
import { cn } from "cn";
import type { ActionResult } from "@/lib/authz";
import { courseInitials, sectionListPath } from "@/lib/course-focus";

export type CourseOption = { id: string; name: string };

/** Chip colors, by position in the list, so each course is easy to spot (like Google Classroom). */
const CHIP_COLORS = [
  "bg-coral",
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
  // The focused course gets a coral edge rather than the filled row the nav uses, so
  // "which course" and "which page" never look like the same thing.
  const rowClass = (active: boolean, focus = false) =>
    cn(
      "relative flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm font-medium transition-colors outline-none",
      "focus-visible:ring-2 focus-visible:ring-white/70",
      focus
        ? "bg-white/10 font-semibold text-white before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-coral"
        : active
          ? "bg-sidebar-accent text-white"
          : "text-white/85 hover:bg-white/10 hover:text-white",
      collapsed && "justify-center px-0"
    );
  const labelClass = cn(
    "min-w-0 truncate",
    collapsed ? "sr-only" : "sr-only md:not-sr-only md:overflow-hidden md:whitespace-nowrap"
  );

  return (
    <div
      role="group"
      aria-labelledby="course-list-heading"
      data-course-switcher
      data-pending={pending || undefined}
      className="flex flex-col gap-0.5 px-2 pt-1"
    >
      <h2
        id="course-list-heading"
        className={cn(
          "px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-white/70 uppercase",
          collapsed ? "sr-only" : "sr-only md:not-sr-only"
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
            className={cn(rowClass(false, active), pending && picking === c.id && "opacity-70")}
          >
            <span
              aria-hidden
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                CHIP_COLORS[i % CHIP_COLORS.length],
                active && "ring-2 ring-white/80"
              )}
            >
              {courseInitials(c.name)}
            </span>
            <span className={labelClass}>{c.name}</span>
          </button>
        );
      })}
      <Link
        href="/app/courses"
        title="Manage courses"
        aria-current={onCourses ? "page" : undefined}
        className={rowClass(onCourses)}
      >
        <Settings2 className="size-4 shrink-0 text-white/70" aria-hidden />
        <span className={cn(labelClass, "text-white/70")}>Manage courses</span>
      </Link>
    </div>
  );
}
