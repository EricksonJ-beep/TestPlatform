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
import { createBank } from "./actions";

export function NewBankDialog({
  courses,
  defaultCourseId,
  label = "New bank",
}: {
  courses: { id: string; name: string }[];
  defaultCourseId: string | null;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
            run(createBank(new FormData(e.currentTarget)), ({ bankId }) => {
              setOpen(false);
              router.push(`/app/banks/${bankId}`);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>New question bank</DialogTitle>
            <DialogDescription>
              A bank belongs to a course so its questions can be tagged with that course&apos;s
              learning targets.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nb-name">Bank name</Label>
              <Input id="nb-name" name="name" placeholder="Anatomy · Unit 3" required autoFocus />
              <FieldError errors={fieldErrors} name="name" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nb-course">Course</Label>
              <select
                id="nb-course"
                name="courseId"
                defaultValue={defaultCourseId ?? ""}
                className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">No course yet</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Importing a CSV needs a course.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nb-desc">Description (optional)</Label>
              <Input id="nb-desc" name="description" />
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
              {pending ? "Creating…" : "Create bank"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
