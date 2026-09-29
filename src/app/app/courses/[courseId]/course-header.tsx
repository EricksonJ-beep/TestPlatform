"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, useAction } from "@/components/use-action";
import { deleteCourse, updateCourse } from "../actions";

export function CourseHeader({
  course,
}: {
  course: { id: string; name: string; description: string | null };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { run, pending, error, fieldErrors, reset } = useAction();

  if (!editing) {
    return (
      <div className="mt-2 flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl">{course.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {course.description ?? "Units, learning targets, and question pools for this course."}
          </p>
          {error ? <p className="mt-1 text-sm text-error-foreground">{error}</p> : null}
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil data-icon="inline-start" aria-hidden />
          Rename
        </Button>
        {confirmDelete ? (
          <span className="inline-flex items-center gap-1">
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => run(deleteCourse(course.id), () => router.push("/app/courses"))}
            >
              Delete for good
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Delete course"
            title="Delete this course with its units, targets, and pools. Refused while classes, banks, assessments, or practice content still use it."
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
    );
  }

  return (
    <form
      className="mt-2 grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(updateCourse(course.id, new FormData(e.currentTarget)), () => setEditing(false));
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="ch-name">Course name</Label>
        <Input id="ch-name" name="name" defaultValue={course.name} required autoFocus />
        <FieldError errors={fieldErrors} name="name" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ch-desc">Description</Label>
        <Input id="ch-desc" name="description" defaultValue={course.description ?? ""} />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            reset();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          Save
        </Button>
      </div>
      {error ? <p className="text-sm text-error-foreground sm:col-span-3">{error}</p> : null}
    </form>
  );
}
