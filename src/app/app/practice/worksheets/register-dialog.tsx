"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { COUNTS_AS_LABEL } from "@/lib/worksheet-rules";
import { TargetPicker } from "@/components/targets/target-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, useAction } from "@/components/use-action";
import { registerWorksheet } from "./actions";

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Target = { id: string; code: string; title: string };

/** Register a worksheet: link or script id, course, what it counts as, and its targets. */
export function RegisterDialog({
  courses,
  targetsByCourse,
  defaultCourseId,
  prefill,
  label = "Register worksheet",
}: {
  courses: { id: string; name: string }[];
  targetsByCourse: Record<string, Target[]>;
  defaultCourseId: string | null;
  prefill?: { ref: string; title: string };
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState(defaultCourseId ?? courses[0]?.id ?? "");
  const { run, pending, error, fieldErrors, reset } = useAction();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant={prefill ? "default" : "outline"} size={prefill ? "sm" : undefined} />
        }
      >
        {prefill ? null : <Plus data-icon="inline-start" aria-hidden />}
        {label}
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(registerWorksheet(new FormData(e.currentTarget)), ({ worksheetId }) => {
              setOpen(false);
              router.push(`/app/practice/worksheets/${worksheetId}`);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Register a worksheet</DialogTitle>
            <DialogDescription>
              Paste the student link from the Worksheet Index (or the script id from Project
              settings). The title fills in from the worksheet on its first submit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rw-ref">Student link or script id</Label>
              <Input
                id="rw-ref"
                name="ref"
                defaultValue={prefill?.ref ?? ""}
                placeholder="https://script.google.com/a/macros/cadott.k12.wi.us/s/…/exec"
                required
                autoFocus={!prefill}
                readOnly={!!prefill}
              />
              <FieldError errors={fieldErrors} name="ref" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rw-title">Title (optional)</Label>
              <Input
                id="rw-title"
                name="title"
                defaultValue={prefill?.title ?? ""}
                placeholder="Unit 1 Practice · Measurement"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rw-course">Course</Label>
              <select
                id="rw-course"
                name="courseId"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className={selectClass}
                required
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rw-counts">Counts as</Label>
              <select
                id="rw-counts"
                name="countsAs"
                defaultValue="practice"
                className={selectClass}
              >
                {(Object.keys(COUNTS_AS_LABEL) as (keyof typeof COUNTS_AS_LABEL)[]).map((k) => (
                  <option key={k} value={k}>
                    {COUNTS_AS_LABEL[k]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Worksheets are problem sets, so practice set is the default. “Both” satisfies the
                activity gate and the practice gate at once.
              </p>
            </div>
            <TargetPicker key={courseId} targets={targetsByCourse[courseId] ?? []} />
            <FieldError errors={fieldErrors} name="targetIds" />
            {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || courses.length === 0}>
              Register
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
