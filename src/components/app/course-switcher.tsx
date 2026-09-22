"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BookOpen, Check, ChevronsUpDown, Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setCurrentCourse } from "@/app/app/courses/actions";

export function CourseSwitcher({
  courses,
  current,
}: {
  courses: { id: string; name: string }[];
  current: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(id: string | null) {
    start(async () => {
      await setCurrentCourse(id);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="ml-auto hidden h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted sm:inline-flex"
        aria-label="Switch course"
        disabled={pending}
      >
        <BookOpen className="size-4 text-muted-foreground" aria-hidden />
        <span className="max-w-48 truncate">{current?.name ?? "All courses"}</span>
        <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>Course</DropdownMenuLabel>
        {courses.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => choose(c.id)}>
            <span className="flex-1 truncate">{c.name}</span>
            {current?.id === c.id ? <Check aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
        {courses.length === 0 ? <DropdownMenuItem disabled>No courses yet</DropdownMenuItem> : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/app/courses" />}>
          <Settings2 aria-hidden />
          Manage courses
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
