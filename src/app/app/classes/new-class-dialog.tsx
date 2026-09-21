"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { createClass } from "./actions";

export function NewClassDialog({ label = "New class" }: { label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await createClass(fd);
      if (r.ok) {
        setOpen(false);
        setError(null);
        setFieldErrors({});
        router.push(`/app/classes/${r.data.classId}`);
      } else {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" aria-hidden />
        {label}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New class</DialogTitle>
            <DialogDescription>
              A class is one roster. You can assign the same test to several classes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nc-name">Class name</Label>
              <Input id="nc-name" name="name" placeholder="Biology · Period 3" required autoFocus />
              {fieldErrors.name ? (
                <p className="text-xs text-error-foreground">{fieldErrors.name[0]}</p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nc-course">Course</Label>
              <Input id="nc-course" name="courseName" placeholder="Biology" list="course-names" />
              <p className="text-xs text-muted-foreground">
                Type a course name; it&apos;s created if it doesn&apos;t exist yet.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="nc-period">Period</Label>
                <Input id="nc-period" name="period" placeholder="3" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nc-term">Term</Label>
                <Input id="nc-term" name="term" placeholder="Fall 2026" />
              </div>
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
              {pending ? "Creating…" : "Create class"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
