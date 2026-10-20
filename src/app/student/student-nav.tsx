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
 * one and Back returns to the last; the current one is underlined only on the home itself.
 */
export function StudentNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === "/student" ? homeTab(params.get("tab")) : null;
  return (
    <nav aria-label="Your sections" className="flex self-stretch overflow-x-auto">
      {HOME_TABS.map((t) => (
        <Link
          key={t}
          href={href(t)}
          aria-current={current === t ? "page" : undefined}
          data-tab={t}
          className={cn(
            "flex shrink-0 items-center border-b-[3px] px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:bg-white/15 sm:px-4 sm:text-[15px]",
            current === t
              ? "border-white font-semibold text-white"
              : "border-transparent text-white/80 hover:text-white"
          )}
        >
          {LABEL[t]}
        </Link>
      ))}
    </nav>
  );
}

/** The home is wide (three lanes); every other student page keeps its reading width. */
export function StudentMain({ children }: { children: ReactNode }) {
  const wide = usePathname() === "/student";
  return (
    <main
      className={cn("mx-auto w-full flex-1 px-4 py-6 md:px-6", wide ? "max-w-6xl" : "max-w-3xl")}
    >
      {children}
    </main>
  );
}
