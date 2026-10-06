import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/authz";
import { getCurrentCourse } from "@/lib/current-course";
import { CourseFocusProvider } from "@/components/app/course-focus";
import { AppSidebar } from "@/components/app/sidebar";
import { AppTopbar } from "@/components/app/topbar";
import { setCurrentCourse } from "./courses/actions";

/** Teacher shell: teal sidebar + top bar. proxy.ts already keeps non-teachers out. */
export default async function TeacherLayout({ children }: LayoutProps<"/app">) {
  const session = await requireTeacher();
  const [org, { courses, current }] = await Promise.all([
    db
      .select({ name: schema.organizations.name })
      .from(schema.users)
      .leftJoin(schema.organizations, eq(schema.users.organizationId, schema.organizations.id))
      .where(eq(schema.users.id, session.userId))
      .limit(1),
    getCurrentCourse(session.userId),
  ]);

  return (
    <CourseFocusProvider currentId={current?.id ?? null} pick={setCurrentCourse}>
      <div className="flex min-h-full">
        <AppSidebar
          organizationName={org[0]?.name ?? null}
          courses={courses}
          currentCourse={current}
          pickCourse={setCurrentCourse}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar session={session} />
          <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
        </div>
      </div>
    </CourseFocusProvider>
  );
}
