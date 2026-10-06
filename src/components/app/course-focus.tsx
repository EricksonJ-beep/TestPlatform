"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import type { ActionResult } from "@/lib/authz";

type Focus = {
  currentId: string | null;
  pick: (courseId: string | null) => Promise<ActionResult<unknown>>;
};

const FocusContext = createContext<Focus | null>(null);

/** Provided by the teacher layout: the course in focus and the action that changes it. */
export function CourseFocusProvider({
  currentId,
  pick,
  children,
}: Focus & { children: ReactNode }) {
  return <FocusContext.Provider value={{ currentId, pick }}>{children}</FocusContext.Provider>;
}

/**
 * Focus follows links (docs/course-focus-plan.md, ticket 7): a detail page
 * renders this with its item's course; if that is not the course in focus,
 * the sidebar switches to it so the page and the sidebar agree. Runs once per
 * page; a course the teacher does not own (a colleague's shared bank) is
 * refused by the action and nothing changes.
 */
export function FollowCourse({ courseId }: { courseId: string | null | undefined }) {
  const focus = useContext(FocusContext);
  const router = useRouter();
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || !courseId || courseId === focus.currentId || done.current === courseId) return;
    done.current = courseId;
    void focus.pick(courseId).then((r) => {
      if (r.ok) router.refresh();
    });
  }, [courseId, focus, router]);
  return null;
}
