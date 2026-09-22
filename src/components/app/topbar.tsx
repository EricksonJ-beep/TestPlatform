import { Search } from "lucide-react";
import { AccountMenu } from "@/components/app/account-menu";
import { CourseSwitcher } from "@/components/app/course-switcher";
import { logoutAction } from "@/app/(auth)/actions";
import type { Session } from "@/lib/session";

/** Teacher top bar: global search (wired in Phase 1), course switcher, account menu. */
export function AppTopbar({
  session,
  courses,
  currentCourse,
}: {
  session: Session;
  courses: { id: string; name: string }[];
  currentCourse: { id: string; name: string } | null;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
      <label className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/30">
        <Search className="size-4 shrink-0" aria-hidden />
        <input
          type="search"
          name="q"
          placeholder="Search questions, tests, students"
          aria-label="Search"
          className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      <CourseSwitcher courses={courses} current={currentCourse} />
      <div className="ml-auto sm:ml-0">
        <AccountMenu
          firstName={session.firstName}
          lastName={session.lastName}
          email={session.email}
          logout={logoutAction}
        />
      </div>
    </header>
  );
}
