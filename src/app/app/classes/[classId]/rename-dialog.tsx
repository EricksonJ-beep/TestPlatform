"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
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
import type { RosterRow } from "@/lib/queries/classes";
import { renameStudent } from "../actions";

/**
 * Fix a misspelled or preferred name. A username login follows the new name, so
 * after saving the dialog shows the new username for the teacher to pass on.
 */
export function RenameDialog({ classId, row }: { classId: string; row: RosterRow }) {
  const [open, setOpen] = useState(false);
  const [newUsername, setNewUsername] = useState<string | null>(null);
  const { run, pending, error, fieldErrors, reset } = useAction();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          reset();
          setNewUsername(null);
        }
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" />}
        aria-label={`Edit name for ${row.firstName} ${row.lastName}`}
        title="Edit name"
      >
        <Pencil aria-hidden />
      </DialogTrigger>
      <DialogContent>
        {newUsername ? (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>New login</DialogTitle>
              <DialogDescription>
                Tell the student their username is now{" "}
                <span className="font-mono text-foreground">{newUsername}</span>. Their password is
                unchanged; the old username no longer works.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(renameStudent(classId, row.studentId, new FormData(e.currentTarget)), (d) =>
                d.usernameChanged && d.username ? setNewUsername(d.username) : setOpen(false)
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit name</DialogTitle>
              <DialogDescription>
                Changes the name shown everywhere in Bloom. Their login ({row.email ?? row.username}
                ) and password stay the same.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`rn-first-${row.studentId}`}>First name</Label>
                <Input
                  id={`rn-first-${row.studentId}`}
                  name="firstName"
                  defaultValue={row.firstName}
                  required
                  maxLength={60}
                />
                <FieldError errors={fieldErrors} name="firstName" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`rn-last-${row.studentId}`}>Last name</Label>
                <Input
                  id={`rn-last-${row.studentId}`}
                  name="lastName"
                  defaultValue={row.lastName}
                  required
                  maxLength={60}
                />
                <FieldError errors={fieldErrors} name="lastName" />
              </div>
            </div>
            {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
