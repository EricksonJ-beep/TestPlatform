import { AccountMenu } from "@/components/app/account-menu";
import { logoutAction } from "@/app/(auth)/actions";
import type { Session } from "@/lib/session";

/**
 * Teacher top bar: the account menu. The search box that sat here did nothing (it was never
 * wired up), so it is gone until global search is built (hardening plan H6.5, Nov 9 2026).
 */
export function AppTopbar({ session }: { session: Session }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
      <div className="ml-auto">
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
