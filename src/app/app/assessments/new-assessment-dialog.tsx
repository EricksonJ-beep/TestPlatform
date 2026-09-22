"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
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
import { createAssessment } from "./actions";
import { TYPE_HELP } from "./type-badge";

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function NewAssessmentDialog({
  courses,
  defaultCourseId,
  label = "New assessment",
}: {
  courses: { id: string; name: string }[];
  defaultCourseId: string | null;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<keyof typeof TYPE_HELP>("formative");
  const { run, pending, error, fieldErrors, reset } = useAction();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" aria-hidden />
        {label}
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(createAssessment(new FormData(e.currentTarget)), ({ assessmentId }) => {
              setOpen(false);
              router.push(`/app/assessments/${assessmentId}`);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>New assessment</DialogTitle>
            <DialogDescription>
              Pick the type first; it sets the attempt policy and results defaults, which you can
              change later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="na-title">Title</Label>
              <Input id="na-title" name="title" placeholder="Unit 3 quiz" required autoFocus />
              <FieldError errors={fieldErrors} name="title" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="na-type">Type</Label>
              <select
                id="na-type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as keyof typeof TYPE_HELP)}
                className={selectClass}
              >
                <option value="practice">Practice</option>
                <option value="formative">Formative</option>
                <option value="summative">Summative</option>
              </select>
              <p className="text-xs text-muted-foreground">{TYPE_HELP[type]}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="na-course">Course</Label>
              <select
                id="na-course"
                name="courseId"
                defaultValue={defaultCourseId ?? courses[0]?.id ?? ""}
                className={selectClass}
                required
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <FieldError errors={fieldErrors} name="courseId" />
              {courses.length === 0 ? (
                <p className="text-xs text-error-foreground">Create a course first.</p>
              ) : null}
            </div>
            {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || courses.length === 0}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
