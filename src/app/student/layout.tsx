import { Suspense } from "react";
import Link from "next/link";
import { requireStudent } from "@/lib/authz";
import { logoutAction } from "@/app/(auth)/actions";
import { Wordmark } from "@/components/brand/wordmark";
import { AccountMenu } from "@/components/app/account-menu";
import { ViewAsBanner } from "./view-as-banner";
import { StudentMain, StudentNav } from "./student-nav";

/**
 * Student shell: a teal bar with the wordmark, the sections (Home, Assessments, Practice, My
 * results; Jon, Oct 20 2026: "tabs at the top") and the account menu, then the page. On a phone
 * the sections get their own row under the wordmark.
 */
export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  const session = await requireStudent();
  return (
    <div className="flex min-h-full flex-col">
      {session.viewingAs ? (
        <ViewAsBanner
          studentName={`${session.firstName} ${session.lastName}`}
          teacherName={session.viewingAs.teacherName}
        />
      ) : null}
      <header className="sticky top-0 z-10 bg-brand text-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 px-4 md:px-6">
          <Link
            href="/student"
            className="flex h-14 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Wordmark tone="inverse" />
          </Link>
          <div className="order-last -mx-4 flex h-11 w-[calc(100%+2rem)] border-t border-white/20 px-1 sm:order-none sm:mx-0 sm:h-14 sm:w-auto sm:flex-1 sm:border-0 sm:px-0">
            <Suspense>
              <StudentNav />
            </Suspense>
          </div>
          <div className="ml-auto rounded-lg bg-white text-foreground sm:ml-0">
            <AccountMenu
              firstName={session.firstName}
              lastName={session.lastName}
              email={session.email ?? session.username ?? null}
              logout={logoutAction}
              passwordHref="/student/password"
            />
          </div>
        </div>
      </header>
      <StudentMain>{children}</StudentMain>
    </div>
  );
}
