"use client";

import { FolderInput } from "lucide-react";
import type { AdoptableRef } from "@/app/app/courses/actions";
import { adoptIntoCourse } from "@/app/app/courses/actions";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";

/**
 * "Put in {course}" (docs/course-focus-plan.md, ticket 8): one click moves an
 * item that belongs to no course into the course in focus, so it files under
 * that course's units instead of the "Not in any course" strip.
 */
export function AdoptButton({
  item,
  course,
  size = "sm",
}: {
  item: AdoptableRef;
  course: { id: string; name: string };
  size?: "sm" | "xs";
}) {
  const { run, pending, error } = useAction();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size={size === "xs" ? "sm" : size}
        variant="outline"
        disabled={pending}
        onClick={() => run(adoptIntoCourse(item, course.id))}
        data-adopt={`${item.type}:${item.id}`}
      >
        <FolderInput data-icon="inline-start" aria-hidden />
        Put in {course.name}
      </Button>
      {error ? <span className="text-xs text-error-foreground">{error}</span> : null}
    </span>
  );
}
