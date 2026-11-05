import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { listCourses } from "@/lib/queries/courses";
import { getSkywardUpdates } from "@/lib/queries/skyward-updates";
import { schoolDate, SCHOOL_TIME_ZONE } from "@/lib/reopen";
import { DownloadChanges, MarkEntered, StartTracking } from "./skyward-controls";

export const metadata: Metadata = { title: "Skyward updates" };

const when = (d: Date | null) =>
  d
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: SCHOOL_TIME_ZONE })
    : "";

/**
 * Skyward updates (Jon, Nov 5 2026: "an efficient process to know what grades need to be changed
 * in Skyward"): every grade whose counting score changed since Bloom last handed it to Jon (a
 * Skyward download or "Mark as entered"), by class and assignment, with what moved it. Download
 * just those rows as Skyward import files, or mark them entered; either way they clear.
 */
export default async function SkywardUpdatesPage() {
  const session = await requireTeacher();
  const [{ tracking, groups }, courses] = await Promise.all([
    getSkywardUpdates(session.userId),
    listCourses(session.userId),
  ]);
  const t = schoolDate(new Date());
  const today = `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
  const total = groups.reduce((n, g) => n + g.total, 0);
  const courseOptions = courses.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-2xl">Skyward updates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Grades that changed in Bloom since you last put them in Skyward: corrections, the
          relearning path, retakes, regrades, and late work.
        </p>
      </div>

      {!tracking ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-base font-medium">Start tracking</h2>
          <p className="text-sm text-muted-foreground">
            Bloom remembers each Skyward file you download from now on. For grades you already put
            in Skyward, pick the day you last entered them. Bloom works out what has changed since
            from each student&apos;s score history.
          </p>
          <StartTracking courses={courseOptions} today={today} />
        </section>
      ) : total === 0 ? (
        <section
          className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm"
          data-skyward-caught-up
        >
          <CheckCircle2 className="size-4 text-success" aria-hidden />
          All caught up: Skyward has every grade Bloom has.
        </section>
      ) : (
        <p className="text-sm" data-skyward-total={total}>
          <span className="font-medium tabular">{total}</span>{" "}
          {total === 1 ? "grade to change" : "grades to change"} in {groups.length}{" "}
          {groups.length === 1 ? "assignment" : "assignments"}.
        </p>
      )}

      {groups.map((g) => (
        <section
          key={g.assignment.id}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          data-skyward-group={g.assignment.id}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-base font-medium">
              <Link href={`/app/results/${g.assignment.id}`} className="hover:underline">
                {g.assignment.title}
              </Link>
              <span className="font-normal text-muted-foreground"> · {g.assignment.className}</span>
            </h2>
            {g.files.length > 1 ? (
              <>
                <DownloadChanges
                  assignmentId={g.assignment.id}
                  file={null}
                  label={`Download all changes (${g.files.length} files)`}
                />
                <MarkEntered
                  assignmentId={g.assignment.id}
                  fileKey={null}
                  label="Mark all entered"
                />
              </>
            ) : null}
          </div>
          {g.files.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5" data-skyward-file={f.label}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{f.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{f.name}.csv</span>
                <span className="mr-auto text-xs text-muted-foreground tabular">
                  {f.changes.length} {f.changes.length === 1 ? "change" : "changes"}
                </span>
                <DownloadChanges
                  assignmentId={g.assignment.id}
                  file={f.index}
                  label="Download changes"
                />
                <MarkEntered assignmentId={g.assignment.id} fileKey={f.key} label="Mark entered" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Student</th>
                      <th className="py-1 pr-3 font-medium">Skyward has</th>
                      <th className="py-1 pr-3 font-medium">Now</th>
                      <th className="py-1 pr-3 font-medium">Why</th>
                      <th className="py-1 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.changes.map((c) => (
                      <tr key={c.studentId} className="border-t border-border" data-skyward-change>
                        <td className="py-1.5 pr-3">
                          {c.lastName}, {c.firstName}
                        </td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{c.from ?? "—"}</td>
                        <td className="py-1.5 pr-3 font-medium">{c.to}</td>
                        <td className="py-1.5 pr-3">{c.reason}</td>
                        <td className="py-1.5 text-muted-foreground">{when(c.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ))}

      {tracking ? (
        <details className="rounded-lg border border-border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium">Start tracking another course</summary>
          <p className="mt-2 mb-3 text-muted-foreground">
            For a course whose grades you entered in Skyward before Bloom kept track: pick the day
            you last entered them.
          </p>
          <StartTracking courses={courseOptions} today={today} />
        </details>
      ) : null}
    </div>
  );
}
