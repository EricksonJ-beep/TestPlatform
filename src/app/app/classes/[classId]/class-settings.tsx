"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
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
import { schoolYearChoices } from "@/lib/school-year";
import { setClassArchived, updateClass } from "../actions";

/**
 * Archive a finished class, or bring it back (Jon, Nov 20 2026). One click each way: nothing is
 * deleted, so there is nothing to confirm.
 */
export function ArchiveClassButton({ classId, archived }: { classId: string; archived: boolean }) {
  const { run, pending, error } = useAction();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => run(setClassArchived(classId, !archived))}
        title={
          archived
            ? "Put this class back on your Dashboard and class lists."
            : "Take this class off your Dashboard and class lists. Nothing is deleted."
        }
        data-archive-class={archived ? "restore" : "archive"}
      >
        {archived ? (
          <ArchiveRestore data-icon="inline-start" aria-hidden />
        ) : (
          <Archive data-icon="inline-start" aria-hidden />
        )}
        {archived ? "Unarchive" : "Archive"}
      </Button>
      {error ? <p className="text-xs text-error-foreground">{error}</p> : null}
    </div>
  );
}

/**
 * Edit a class after it is made (Jon, Nov 20 2026: "in case I miss some information"): the
 * fields of the New class form.
 */
export function EditClassDialog({
  cls,
}: {
  cls: {
    id: string;
    name: string;
    courseName: string | null;
    period: string | null;
    term: string | null;
    schoolYear: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [years] = useState(() => schoolYearChoices(new Date()));
  const { run, pending, error, fieldErrors, reset } = useAction();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" />} data-edit-class>
        <Pencil data-icon="inline-start" aria-hidden />
        Edit class
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(updateClass(cls.id, new FormData(e.currentTarget)), () => setOpen(false));
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit class</DialogTitle>
            <DialogDescription>
              Fix or fill in anything about this class. Its students and their work stay as they
              are.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ec-name">Class name</Label>
              <Input id="ec-name" name="name" defaultValue={cls.name} required maxLength={80} />
              <FieldError errors={fieldErrors} name="name" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ec-course">Course</Label>
              <Input
                id="ec-course"
                name="courseName"
                defaultValue={cls.courseName ?? ""}
                list="course-names"
                maxLength={80}
              />
              <p className="text-xs text-muted-foreground">
                Type a course name; it&apos;s created if it doesn&apos;t exist yet.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="ec-period">Period</Label>
                <Input id="ec-period" name="period" defaultValue={cls.period ?? ""} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ec-term">Term</Label>
                <Input id="ec-term" name="term" defaultValue={cls.term ?? ""} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ec-year">School year</Label>
                <Input
                  id="ec-year"
                  name="schoolYear"
                  defaultValue={cls.schoolYear ?? years[1]}
                  list="ec-years"
                  autoComplete="off"
                />
                <datalist id="ec-years">
                  {years.map((y) => (
                    <option key={y} value={y} />
                  ))}
                </datalist>
              </div>
            </div>
            <FieldError errors={fieldErrors} name="schoolYear" />
          </div>
          {error && !Object.keys(fieldErrors).length ? (
            <p className="text-sm text-error-foreground">{error}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
