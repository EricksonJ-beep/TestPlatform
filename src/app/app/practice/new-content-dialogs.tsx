"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { KIND_LABEL, KIND_RULE } from "@/lib/practice-rules";
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
import { createActivity, createPracticeSet } from "./actions";

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Course = { id: string; name: string };

function CourseSelect({
  courses,
  defaultCourseId,
  id,
}: {
  courses: Course[];
  defaultCourseId: string | null;
  id: string;
}) {
  return (
    <select
      id={id}
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
  );
}

export function NewPracticeSetDialog({
  courses,
  defaultCourseId,
  label = "New practice set",
}: {
  courses: Course[];
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
            run(createPracticeSet(new FormData(e.currentTarget)), ({ practiceSetId }) => {
              setOpen(false);
              router.push(`/app/practice/sets/${practiceSetId}`);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>New practice set</DialogTitle>
            <DialogDescription>
              Questions students can try as often as they like, with instant feedback. Never graded.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="nps-title">Title</Label>
              <Input
                id="nps-title"
                name="title"
                placeholder="LT4 practice · cell transport"
                required
                autoFocus
              />
              <FieldError errors={fieldErrors} name="title" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nps-course">Course</Label>
              <CourseSelect id="nps-course" courses={courses} defaultCourseId={defaultCourseId} />
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

const KINDS = ["video", "reading", "link", "guided_notes"] as const;

export function NewActivityDialog({
  courses,
  defaultCourseId,
  label = "New activity",
}: {
  courses: Course[];
  defaultCourseId: string | null;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]>("video");
  const { run, pending, error, fieldErrors, reset } = useAction();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Sparkles data-icon="inline-start" aria-hidden />
        {label}
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(createActivity(new FormData(e.currentTarget)), ({ activityId }) => {
              setOpen(false);
              router.push(`/app/practice/activities/${activityId}`);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>New relearning activity</DialogTitle>
            <DialogDescription>
              Learning, not testing: a video, a reading, a link, or guided notes tagged to a target.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="na-title">Title</Label>
              <Input
                id="na-title"
                name="title"
                placeholder="Osmosis in 4 minutes"
                required
                autoFocus
              />
              <FieldError errors={fieldErrors} name="title" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="na-kind">Kind</Label>
              <select
                id="na-kind"
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
                className={selectClass}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Complete when: {KIND_RULE[kind]}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="na-course">Course</Label>
              <CourseSelect id="na-course" courses={courses} defaultCourseId={defaultCourseId} />
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
