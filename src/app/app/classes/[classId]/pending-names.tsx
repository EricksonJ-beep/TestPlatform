"use client";

import { useState } from "react";
import { ListPlus, X } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { addRosterNames, removeRosterName } from "../actions";

/** Names waiting to be claimed with the join code. */
export function PendingNames({
  classId,
  names,
}: {
  classId: string;
  names: { id: string; firstName: string; lastName: string }[];
}) {
  const [open, setOpen] = useState(false);
  const { run, pending, error, reset } = useAction();

  return (
    <section
      className="rounded-lg border border-border bg-card p-4"
      aria-labelledby="pending-title"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="pending-title" className="text-sm font-medium">
          Waiting to join
        </h2>
        <span className="text-xs text-muted-foreground tabular">
          {names.length} {names.length === 1 ? "name" : "names"}
        </span>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) reset();
          }}
        >
          <DialogTrigger render={<Button variant="outline" size="sm" className="ml-auto" />}>
            <ListPlus data-icon="inline-start" aria-hidden />
            Add names
          </DialogTrigger>
          <DialogContent>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                run(addRosterNames(classId, new FormData(e.currentTarget)), () => setOpen(false));
              }}
            >
              <DialogHeader>
                <DialogTitle>Add names to the roster</DialogTitle>
                <DialogDescription>
                  One per line, as &quot;Last, First&quot; or &quot;First Last&quot;. Paste straight
                  from Skyward; middle initials are dropped. Students claim their name when they
                  join with the code.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor="pn-names">Names</Label>
                <Textarea
                  id="pn-names"
                  name="names"
                  rows={8}
                  placeholder={"ALLARD, BRAEDEN R\nAMADON, KAYLA R"}
                  required
                />
              </div>
              {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  Add
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {names.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Everyone on the list has joined, or no names have been added yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-1.5" data-pending-names>
          {names.map((n) => (
            <li
              key={n.id}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
            >
              {n.lastName}, {n.firstName}
              <button
                type="button"
                aria-label={`Remove ${n.firstName} ${n.lastName}`}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                disabled={pending}
                onClick={() => run(removeRosterName(classId, n.id))}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && !open ? <p className="mt-2 text-sm text-error-foreground">{error}</p> : null}
    </section>
  );
}
