"use client";

import { useRouter } from "next/navigation";

/** Narrow the class activity feed to one student (URL-driven so it survives a refresh). */
export function StudentFilter({
  classId,
  current,
  students,
}: {
  classId: string;
  current: string | null;
  students: { id: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Show</span>
      <select
        value={current ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v ? `/app/classes/${classId}/activity?student=${v}` : `/app/classes/${classId}/activity`);
        }}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Student"
      >
        <option value="">Everyone in the class</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
