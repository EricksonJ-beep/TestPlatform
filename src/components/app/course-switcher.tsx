"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronsUpDown, Settings2 } from "lucide-react";
import { cn } from "cn";
import type { ActionResult } from "@/lib/authz";
import { courseInitials, sectionListPath } from "@/lib/course-focus";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CourseOption = { id: string; name: string };

/**
 * The course the teacher is focused on, at the top of the sidebar (Jon, Oct 6
 * 2026: "toggle between classes and focus on each class at one time… like
 * Google Classroom"). Picking a course remembers it and lands on the same
 * section's list for that course; the Dashboard and other global pages stay.
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
  if (courses.length === 0) return null;

  function choose(id: string) {
    if (id === current?.id) return;
    start(async () => {
      const r = await pick(id);
      if (!r.ok) return;
      const next = sectionListPath(pathname);
      if (next !== pathname) router.push(next);
      router.refresh();
    });
  }

  const label = current?.name ?? "Pick a course";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Course: ${label}. Switch course`}
        title={label}
        data-course-switcher
        data-pending={pending || undefined}
        className={cn(
          "flex items-center gap-2 rounded-md text-left text-sm font-medium text-white transition-colors outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 data-[popup-open]:bg-white/10",
          collapsed ? "mx-auto size-9 justify-center" : "mx-2 h-10 px-2.5",
          pending && "opacity-70"
        )}
      >
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-coral text-[11px] font-bold text-white"
        >
          {current ? courseInitials(current.name) : "?"}
        </span>
        <span className={cn("min-w-0 flex-1", collapsed ? "sr-only" : "sr-only md:not-sr-only")}>
          <span className="block truncate leading-tight">{label}</span>
          <span className="block text-[11px] leading-tight font-normal text-white/70">Course</span>
        </span>
        <ChevronsUpDown
          className={cn("size-4 shrink-0 text-white/70", collapsed ? "hidden" : "hidden md:block")}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuRadioGroup value={current?.id ?? ""} onValueChange={(v) => choose(String(v))}>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Focus on</DropdownMenuLabel>
          {courses.map((c) => (
            <DropdownMenuRadioItem key={c.id} value={c.id} closeOnClick data-course-option={c.id}>
              {c.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/app/courses")}>
          <Settings2 aria-hidden />
          Manage courses
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
