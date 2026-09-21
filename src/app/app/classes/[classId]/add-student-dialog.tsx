"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
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
import { addStudent, type CreatedStudent } from "../actions";
import { PasswordReveal } from "./password-reveal";

export function AddStudentDialog({ classId }: { classId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CreatedStudent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function reset() {
    setResult(null);
    setError(null);
    setFieldErrors({});
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await addStudent(classId, fd);
      if (r.ok) {
        setError(null);
        setFieldErrors({});
        setResult(r.data);
      } else {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
      }
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
        <UserPlus data-icon="inline-start" aria-hidden />
        Add student
      </DialogTrigger>
      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {result.status === "created"
                  ? `${result.firstName} is in the class`
                  : result.status === "enrolled_existing"
                    ? `${result.firstName} was added to this class`
                    : `${result.firstName} is already in this class`}
              </DialogTitle>
              <DialogDescription>
                {result.status === "created"
                  ? "Hand them this temporary password. It is shown once; you can reset it any time from the roster."
                  : "They already had an account, so their existing password still works."}
              </DialogDescription>
            </DialogHeader>
            {result.tempPassword ? (
              <PasswordReveal email={result.email} password={result.tempPassword} />
            ) : null}
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Add another
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Add a student</DialogTitle>
              <DialogDescription>
                Use their Cadott Google email. Leave the password blank to generate one.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="as-first">First name</Label>
                  <Input id="as-first" name="firstName" required autoFocus />
                  {fieldErrors.firstName ? (
                    <p className="text-xs text-error-foreground">{fieldErrors.firstName[0]}</p>
                  ) : null}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="as-last">Last name</Label>
                  <Input id="as-last" name="lastName" required />
                  {fieldErrors.lastName ? (
                    <p className="text-xs text-error-foreground">{fieldErrors.lastName[0]}</p>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="as-email">Email</Label>
                <Input id="as-email" name="email" type="email" required />
                {fieldErrors.email ? (
                  <p className="text-xs text-error-foreground">{fieldErrors.email[0]}</p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="as-pw">Temporary password (optional)</Label>
                <Input
                  id="as-pw"
                  name="tempPassword"
                  autoComplete="off"
                  placeholder="Generated if blank"
                />
                {fieldErrors.tempPassword ? (
                  <p className="text-xs text-error-foreground">{fieldErrors.tempPassword[0]}</p>
                ) : null}
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
                {pending ? "Adding…" : "Add student"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
