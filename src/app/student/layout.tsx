import { Suspense } from "react";
import Link from "next/link";
import { requireStudent } from "@/lib/authz";
import { logoutAction } from "@/app/(auth)/actions";
import { Wordmark } from "@/components/brand/wordmark";
import { AccountMenu } from "@/components/app/account-menu";
import { ViewAsBanner } from "./view-as-banner";
import { StudentMain, StudentNav } from "./student-nav";

/**
 * Student shell (home pages redesign §2): a white bar with the wordmark, the sections (Home,
 * Assessments, Practice, My results; Jon, Oct 20 2026: "tabs at the top") and the account
 * button, then the page. On a phone the sections get their own row under the wordmark.
 */
export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  const session = await requireStudent({ tempPasswordOk: true });
  return (
    <div className="flex min-h-full flex-col">
      {session.viewingAs ? (
        <ViewAsBanner
          studentName={`${session.firstName} ${session.lastName}`}
          teacherName={session.viewingAs.teacherName}
        />
      ) : null}
      <header className="bloom-shell border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-8">
          <Link href="/student" className="flex h-11 items-center rounded-[10px]">
            <Wordmark />
          </Link>
          <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
            <Suspense>
              <StudentNav />
            </Suspense>
          </div>
          <div className="ml-auto sm:ml-0">
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
      <Suspense>
        <StudentMain>{children}</StudentMain>
      </Suspense>
    </div>
  );
}
