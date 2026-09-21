import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/authz";
import { AppSidebar } from "@/components/app/sidebar";
import { AppTopbar } from "@/components/app/topbar";

/** Teacher shell: teal sidebar + top bar. proxy.ts already keeps non-teachers out. */
export default async function TeacherLayout({ children }: LayoutProps<"/app">) {
  const session = await requireTeacher();
  const org = await db
    .select({ name: schema.organizations.name })
    .from(schema.users)
    .leftJoin(schema.organizations, eq(schema.users.organizationId, schema.organizations.id))
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  return (
    <div className="flex min-h-full">
      <AppSidebar organizationName={org[0]?.name ?? null} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar session={session} termLabel="All courses · 2026–27" />
        <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
