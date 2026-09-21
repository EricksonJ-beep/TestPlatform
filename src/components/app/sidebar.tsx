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
import { Wordmark } from "@/components/brand/wordmark";

const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
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

/** Teal left sidebar. Collapses to an icon rail; remembers the choice per browser. */
export function AppSidebar({ organizationName }: { organizationName?: string | null }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);

  function toggle() {
    writeCollapsed(!collapsed);
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside
      data-collapsed={collapsed ? "" : undefined}
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-14" : "w-14 md:w-56"
      )}
    >
      <div className={cn("flex h-14 items-center", collapsed ? "justify-center" : "px-3")}>
        <Link
          href="/app"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          {collapsed ? (
            <span aria-label="Bloom" className="block size-6 rounded-md bg-coral" />
          ) : (
            <>
              <span className="md:hidden">
                <span aria-label="Bloom" className="block size-6 rounded-md bg-coral" />
              </span>
              <span className="hidden md:inline">
                <Wordmark tone="inverse" />
              </span>
            </>
          )}
        </Link>
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-2 pt-1">
        {NAV.map(({ href, label, icon: Icon, ...rest }) => {
          const active = isActive(href, "exact" in rest ? rest.exact : false);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              title={label}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-white/70",
                active
                  ? "bg-sidebar-accent text-white"
                  : "text-white/85 hover:bg-white/10 hover:text-white",
                collapsed && "justify-center px-0"
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className={cn("truncate", collapsed ? "sr-only" : "sr-only md:not-sr-only")}>
                {label}
              </span>
            </Link>
          );
        })}
        <div className="my-2 h-px bg-sidebar-border" />
        <Link
          href="/app/settings"
          aria-current={isActive("/app/settings") ? "page" : undefined}
          title="Settings"
          className={cn(
            "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            isActive("/app/settings")
              ? "bg-sidebar-accent text-white"
              : "text-white/85 hover:bg-white/10 hover:text-white",
            collapsed && "justify-center px-0"
          )}
        >
          <Settings className="size-4 shrink-0" aria-hidden />
          <span className={cn("truncate", collapsed ? "sr-only" : "sr-only md:not-sr-only")}>
            Settings
          </span>
        </Link>
      </nav>

      <div className={cn("flex items-center gap-2 p-2", collapsed ? "justify-center" : "px-3")}>
        {!collapsed && organizationName ? (
          <span className="hidden truncate text-xs text-white/70 md:inline">
            {organizationName}
          </span>
        ) : null}
        <button
          type="button"
          onClick={toggle}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="ml-auto hidden size-8 items-center justify-center rounded-md text-white/80 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 md:inline-flex"
        >
          <PanelLeft className="size-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
