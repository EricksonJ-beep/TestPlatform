"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { copyAssessmentToMine, copyBankToMine } from "./actions";

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** "Copy to my banks / assessments": pick one of your courses (targets remap by code), then copy. */
export function CopyToMine({
  kind,
  id,
  courses,
  defaultCourseId,
}: {
  kind: "bank" | "assessment";
  id: string;
  courses: { id: string; name: string }[];
  defaultCourseId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState(defaultCourseId ?? courses[0]?.id ?? "");
  const { run, pending, error } = useAction();
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-copy-to-mine={kind}>
        <Copy data-icon="inline-start" aria-hidden />
        Copy to my {kind === "bank" ? "banks" : "assessments"}
      </Button>
    );
  return (
    <span className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Course for the copy"
        className={selectClass}
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
      >
        <option value="">No course</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          const f = new FormData();
          f.set("courseId", courseId);
          if (kind === "bank")
            run(copyBankToMine(id, f), ({ bankId }) => router.push(`/app/banks/${bankId}`));
          else
            run(copyAssessmentToMine(id, f), ({ assessmentId }) =>
              router.push(`/app/assessments/${assessmentId}`)
            );
        }}
      >
        {pending ? "Copying…" : "Copy"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error ? <span className="basis-full text-xs text-error-foreground">{error}</span> : null}
    </span>
  );
}
