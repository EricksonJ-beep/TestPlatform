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
import { createCourse } from "./actions";

export function NewCourseDialog({ label = "New course" }: { label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { run, pending, error, fieldErrors, reset } = useAction();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run(createCourse(new FormData(e.currentTarget)), ({ courseId }) => {
      setOpen(false);
      router.push(`/app/courses/${courseId}`);
    });
  }

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
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New course</DialogTitle>
            <DialogDescription>Banks, tests, and classes all attach to a course.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nc-name">Course name</Label>
              <Input id="nc-name" name="name" placeholder="Biology" required autoFocus />
              <FieldError errors={fieldErrors} name="name" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nc-desc">Description (optional)</Label>
              <Input id="nc-desc" name="description" placeholder="10th grade, two sections" />
            </div>
          </div>
          {error && !Object.keys(fieldErrors).length ? (
            <p
              role="alert"
              className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
            >
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create course"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
