"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, useAction } from "@/components/use-action";
import type { ActionResult } from "@/lib/authz";
import type { TargetRow, UnitRow } from "@/lib/queries/courses";
import { createTarget, deleteTarget, updateTarget } from "../actions";

type Editing = { mode: "new" } | { mode: "edit"; target: TargetRow } | null;

export function TargetsPanel({
  courseId,
  targets,
  units,
}: {
  courseId: string;
  targets: TargetRow[];
  units: UnitRow[];
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const { run, pending, error, fieldErrors, reset } = useAction();
  const unitName = new Map(units.map((u) => [u.id, u.name]));

  function close() {
    setEditing(null);
    reset();
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!editing) return;
    const promise: Promise<ActionResult<unknown>> =
      editing.mode === "new"
        ? createTarget(courseId, fd)
        : updateTarget(courseId, editing.target.id, fd);
    run(promise, close);
  }

  const nextCode = `LT${targets.length + 1}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Learning targets</CardTitle>
        <CardAction>
          <Button size="sm" onClick={() => setEditing({ mode: "new" })}>
            <Plus data-icon="inline-start" aria-hidden />
            Add target
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {targets.length === 0 ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">
            Targets are what every question, pool, and test section is tagged with. Codes like LT1
            show on chips; keep them short.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {targets.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-6 py-3 text-sm">
                <TargetChip code={t.code} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {[t.unitId ? unitName.get(t.unitId) : null, `${t.questions} questions`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {t.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                  ) : null}
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Edit ${t.code}`}
                  onClick={() => setEditing({ mode: "edit", target: t })}
                >
                  <Pencil aria-hidden />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Delete ${t.code}`}
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Delete ${t.code} · ${t.title}?`))
                      run(deleteTarget(courseId, t.id));
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error && !editing ? (
          <p className="px-6 py-3 text-sm text-error-foreground">{error}</p>
        ) : null}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>
                {editing?.mode === "edit" ? "Edit learning target" : "New learning target"}
              </DialogTitle>
              <DialogDescription>
                The code appears on chips everywhere; the title is what students read.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-[7rem_1fr] gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="lt-code">Code</Label>
                  <Input
                    id="lt-code"
                    name="code"
                    defaultValue={editing?.mode === "edit" ? editing.target.code : nextCode}
                    required
                    autoFocus
                  />
                  <FieldError errors={fieldErrors} name="code" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lt-title">Title</Label>
                  <Input
                    id="lt-title"
                    name="title"
                    placeholder="Active transport"
                    defaultValue={editing?.mode === "edit" ? editing.target.title : ""}
                    required
                  />
                  <FieldError errors={fieldErrors} name="title" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lt-unit">Unit</Label>
                <select
                  id="lt-unit"
                  name="unitId"
                  defaultValue={editing?.mode === "edit" ? (editing.target.unitId ?? "") : ""}
                  className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">No unit</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lt-desc">Description (optional)</Label>
                <Input
                  id="lt-desc"
                  name="description"
                  placeholder="I can explain how the sodium-potassium pump moves ions against a gradient."
                  defaultValue={editing?.mode === "edit" ? (editing.target.description ?? "") : ""}
                />
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
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {editing?.mode === "edit" ? "Save" : "Add target"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
