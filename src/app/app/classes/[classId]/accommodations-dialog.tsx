"use client";

import { useState } from "react";
import { Accessibility } from "lucide-react";
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
import { setAccommodations } from "../actions";

/** Per-student extra time and font scale; shown as a compact summary until edited. */
export function AccommodationsDialog({ classId, row }: { classId: string; row: RosterRow }) {
  const [open, setOpen] = useState(false);
  const { run, pending, error, fieldErrors, reset } = useAction();
  const summary =
    row.extraTimePercent === 0 && row.fontScale === 100
      ? "None"
      : [
          row.extraTimePercent ? `+${row.extraTimePercent}% time` : null,
          row.fontScale !== 100 ? `${row.fontScale}% font` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" />}
        aria-label={`Accommodations for ${row.firstName} ${row.lastName}`}
      >
        <Accessibility data-icon="inline-start" aria-hidden />
        {summary}
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(setAccommodations(classId, row.studentId, new FormData(e.currentTarget)), () =>
              setOpen(false)
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>
              Accommodations · {row.firstName} {row.lastName}
            </DialogTitle>
            <DialogDescription>
              Applied to every timed assignment in this class. Extra time stretches the limit; font
              scale enlarges the test screen.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`acc-time-${row.studentId}`}>Extra time (%)</Label>
              <Input
                id={`acc-time-${row.studentId}`}
                name="extraTimePercent"
                type="number"
                min={0}
                max={300}
                step={25}
                defaultValue={row.extraTimePercent}
              />
              <FieldError errors={fieldErrors} name="extraTimePercent" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`acc-font-${row.studentId}`}>Font scale (%)</Label>
              <Input
                id={`acc-font-${row.studentId}`}
                name="fontScale"
                type="number"
                min={100}
                max={200}
                step={25}
                defaultValue={row.fontScale}
              />
              <FieldError errors={fieldErrors} name="fontScale" />
            </div>
          </div>
          {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
