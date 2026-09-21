import Link from "next/link";
import { requireStudent } from "@/lib/authz";
import { logoutAction } from "@/app/(auth)/actions";
import { Wordmark } from "@/components/brand/wordmark";
import { AccountMenu } from "@/components/app/account-menu";

/** Student shell: wordmark + name on top, content centered below. Chromebook-friendly widths. */
export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  const session = await requireStudent();
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-card px-4 md:px-6">
        <Link href="/student" className="rounded-md outline-none focus-visible:ring-2">
          <Wordmark />
        </Link>
        <div className="ml-auto">
          <AccountMenu
            firstName={session.firstName}
            lastName={session.lastName}
            email={session.email}
            logout={logoutAction}
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
