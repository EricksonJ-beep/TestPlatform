"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  BarChart3,
  ClipboardList,
  Layers,
  LayoutDashboard,
  Library,
  PanelLeft,
  Send,
  Settings,
  Share2,
  Users,
} from "lucide-react";
import { cn } from "cn";
import type { ActionResult } from "@/lib/authz";
import { BloomMark, Wordmark } from "@/components/brand/wordmark";
import { CourseSwitcher, type CourseOption } from "@/components/app/course-switcher";

const NAV = [
  { href: "/app", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/app/banks", label: "Question banks", icon: Library },
  { href: "/app/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/app/practice", label: "Practice sets", icon: Layers },
  { href: "/app/assign", label: "Assign", icon: Send },
  { href: "/app/results", label: "Results", icon: BarChart3 },
  { href: "/app/classes", label: "Classes", icon: Users },
  { href: "/app/shared", label: "Shared", icon: Share2 },
] as const;

const STORAGE_KEY = "bloom.sidebar.collapsed";

// The collapsed flag lives in localStorage; useSyncExternalStore keeps SSR (always
// expanded) and the browser's remembered choice in sync without a setState-in-effect.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* private mode etc. */
  }
  listeners.forEach((cb) => cb());
}

/**
 * The teacher's sidebar (home pages redesign §2): white with a right border, about 220px wide.
 * On a narrow screen it stacks above the page as wrapping rows (it is not sticky and not a full
 * screen tall). From `md` it can collapse to an icon rail; the choice is remembered per browser.
 * The course list under the wordmark sets the course every scoped section shows
 * (docs/course-focus-plan.md).
 */
export function AppSidebar({
  organizationName,
  courses,
  currentCourse,
  pickCourse,
}: {
  organizationName?: string | null;
  courses: CourseOption[];
  currentCourse: CourseOption | null;
  pickCourse: (courseId: string | null) => Promise<ActionResult<unknown>>;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);

  function toggle() {
    writeCollapsed(!collapsed);
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  const navLink = (active: boolean) =>
    cn(
      "flex h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium md:h-10",
      active ? "bg-ink text-white" : "text-ink hover:bg-stain-wash",
      collapsed && "md:justify-center md:px-0"
    );
  const navText = cn("truncate", collapsed && "md:sr-only");

  return (
    <aside
      data-collapsed={collapsed ? "" : undefined}
      className={cn(
        "bloom-shell flex w-full shrink-0 flex-col gap-2 border-b border-line bg-surface p-3 md:border-r md:border-b-0",
        collapsed ? "md:w-16" : "md:w-[220px]"
      )}
    >
      <div className={cn("flex h-11 items-center", collapsed ? "md:justify-center" : "px-1")}>
        <Link href="/app" className="rounded-[10px]" aria-label="Bloom home">
          <span className={cn(collapsed && "md:hidden")}>
            <Wordmark />
          </span>
          {collapsed ? (
            <span className="hidden md:block">
              <BloomMark />
            </span>
          ) : null}
        </Link>
      </div>

      <CourseSwitcher
        courses={courses}
        current={currentCourse}
        collapsed={collapsed}
        pick={pickCourse}
      />
      {courses.length > 0 ? <div className="h-px bg-line" /> : null}
      <nav
        aria-label="Main"
        className="flex flex-row flex-wrap gap-1 md:flex-1 md:flex-col md:flex-nowrap"
      >
        {NAV.map(({ href, label, icon: Icon, ...rest }) => {
          const active = isActive(href, "exact" in rest ? rest.exact : false);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? label : undefined}
              className={navLink(active)}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className={navText}>{label}</span>
            </Link>
          );
        })}
        <Link
          href="/app/settings"
          aria-current={isActive("/app/settings") ? "page" : undefined}
          title={collapsed ? "Settings" : undefined}
          className={navLink(isActive("/app/settings"))}
        >
          <Settings className="size-4 shrink-0" aria-hidden />
          <span className={navText}>Settings</span>
        </Link>
      </nav>

      <div
        className={cn("hidden items-center gap-2 md:flex", collapsed ? "justify-center" : "px-1")}
      >
        {!collapsed && organizationName ? (
          <span className="truncate text-[13px] text-ink-muted">{organizationName}</span>
        ) : null}
        <button
          type="button"
          onClick={toggle}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="ml-auto inline-flex size-11 items-center justify-center rounded-[10px] text-ink-muted hover:bg-stain-wash hover:text-ink"
        >
          <PanelLeft className="size-4" aria-hidden />
        </button>
      </div>
      {organizationName ? (
        <p className="px-1 text-[13px] text-ink-muted md:hidden">{organizationName}</p>
      ) : null}
    </aside>
  );
}
