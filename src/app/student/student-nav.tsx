"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "cn";
import { HOME_TABS, homeTab, type HomeTab } from "@/lib/student-home";

const LABEL: Record<HomeTab, string> = {
  home: "Home",
  assessments: "Assessments",
  practice: "Practice",
  results: "My results",
};

const href = (t: HomeTab) => (t === "home" ? "/student" : `/student?tab=${t}`);

/**
 * The student's sections in the top bar (Jon, Oct 20 2026: "the tabs should be at the top so they
 * are easier to see and follow"). Each is `?tab=` on the home, so a to-do row can still link to
 * one and Back returns to the last; the current one is white on ink only on the home itself.
 */
export function StudentNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === "/student" ? homeTab(params.get("tab")) : null;
  return (
    <nav aria-label="Your sections" className="flex flex-wrap gap-1">
      {HOME_TABS.map((t) => (
        <Link
          key={t}
          href={href(t)}
          aria-current={current === t ? "page" : undefined}
          data-tab={t}
          className={cn(
            "flex h-11 shrink-0 items-center rounded-[10px] px-3 text-[15px] font-medium whitespace-nowrap sm:px-4",
            current === t ? "bg-ink text-white" : "text-ink hover:bg-stain-wash"
          )}
        >
          {LABEL[t]}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The home is wide (1120px, with its own padding: the redesign §5); every other student page
 * keeps its reading width.
 */
export function StudentMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const home = pathname === "/student" && homeTab(params.get("tab")) === "home";
  return (
    <main
      className={cn(
        "mx-auto w-full flex-1",
        home
          ? "max-w-[1120px] px-4 pt-6 pb-12 sm:px-8 sm:pt-9 sm:pb-16"
          : cn("px-4 py-6 md:px-6", pathname === "/student" ? "max-w-6xl" : "max-w-3xl")
      )}
    >
      {children}
    </main>
  );
}
