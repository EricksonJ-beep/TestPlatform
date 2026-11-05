"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markSkywardEntered, startTrackingSkyward } from "./actions";

/**
 * Download only the changed rows (a form post, so Bloom records what it handed over). The page
 * refreshes a moment later so the rows clear once the file is on its way.
 */
export function DownloadChanges({
  assignmentId,
  file,
  label,
}: {
  assignmentId: string;
  /** The file's index in the assignment's export; null downloads every changed file (.zip). */
  file: number | null;
  label: string;
}) {
  const router = useRouter();
  return (
    <form
      method="post"
      action={`/api/results/${assignmentId}/skyward`}
      onSubmit={() => window.setTimeout(() => router.refresh(), 1500)}
    >
      <input type="hidden" name="changes" value="1" />
      {file === null ? null : <input type="hidden" name="file" value={String(file)} />}
      <Button type="submit" variant="outline" size="sm">
        <Download data-icon="inline-start" aria-hidden />
        {label}
      </Button>
    </form>
  );
}

/** "Mark as entered": typed into Skyward by hand, so these rows clear. */
export function MarkEntered({
  assignmentId,
  fileKey,
  label,
}: {
  assignmentId: string;
  fileKey: string | null;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await markSkywardEntered(assignmentId, fileKey);
            if (!res.ok) setError(res.error);
            else router.refresh();
          })
        }
      >
        <Check data-icon="inline-start" aria-hidden />
        {pending ? "Saving…" : label}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** "I entered everything in Skyward up to <date>" for one course. */
export function StartTracking({
  courses,
  today,
}: {
  courses: { id: string; name: string }[];
  /** yyyy-mm-dd in school time, the date box's default and latest. */
  today: string;
}) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (courses.length === 0) return null;
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setResult(null);
        start(async () => {
          const res = await startTrackingSkyward(courseId, date);
          if (!res.ok) setError(res.error);
          else {
            setResult(
              res.data.assignments
                ? `Tracking ${res.data.assignments} ${res.data.assignments === 1 ? "assignment" : "assignments"}.`
                : "Nothing new to track in that course."
            );
            router.refresh();
          }
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Course</span>
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2"
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Entered in Skyward up to</span>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 tabular"
          required
        />
      </label>
      <Button type="submit" size="sm" disabled={pending || !courseId}>
        {pending ? "Working…" : "Start tracking"}
      </Button>
      {result ? <span className="text-sm text-success-foreground">{result}</span> : null}
      {error ? (
        <span role="alert" className="text-sm text-error">
          {error}
        </span>
      ) : null}
    </form>
  );
}
