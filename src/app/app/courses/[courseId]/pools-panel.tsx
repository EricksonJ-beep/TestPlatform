"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { TargetChip } from "@/components/targets/target-chip";
import { TargetPicker } from "@/components/targets/target-picker";
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
import type { PoolRow, TargetRow } from "@/lib/queries/courses";
import { createPool, deletePool, updatePool } from "../actions";

type Editing = { mode: "new" } | { mode: "edit"; pool: PoolRow } | null;

export function PoolsPanel({
  courseId,
  pools,
  targets,
}: {
  courseId: string;
  pools: PoolRow[];
  targets: TargetRow[];
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const { run, pending, error, fieldErrors, reset } = useAction();
  const byId = new Map(targets.map((t) => [t.id, t]));

  function close() {
    setEditing(null);
    reset();
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!editing) return;
    const promise: Promise<ActionResult<unknown>> =
      editing.mode === "new" ? createPool(courseId, fd) : updatePool(courseId, editing.pool.id, fd);
    run(promise, close);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Question pools</CardTitle>
        <CardAction>
          <Button size="sm" variant="secondary" onClick={() => setEditing({ mode: "new" })}>
            <Plus data-icon="inline-start" aria-hidden />
            Add pool
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {pools.length === 0 ? (
          <p className="px-6 pb-4 text-sm text-muted-foreground">
            A pool is a named set of questions a test can draw from. Tag each pool to its targets so
            retakes cover the same targets.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {pools.map((p) => (
              <li key={p.id} className="flex items-start gap-3 px-6 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.questions} {p.questions === 1 ? "question" : "questions"}
                    {p.description ? ` · ${p.description}` : ""}
                  </p>
                  {p.targetIds.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.targetIds.map((id) => {
                        const t = byId.get(id);
                        return t ? <TargetChip key={id} code={t.code} title={t.title} /> : null;
                      })}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-warning-foreground">
                      Not tagged to a target yet.
                    </p>
                  )}
                  {p.drawStimulusGroups ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Draws whole stimulus groups
                    </p>
                  ) : null}
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Edit ${p.name}`}
                  onClick={() => setEditing({ mode: "edit", pool: p })}
                >
                  <Pencil aria-hidden />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Delete ${p.name}`}
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Delete pool "${p.name}"?`)) run(deletePool(courseId, p.id));
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
                {editing?.mode === "edit" ? "Edit pool" : "New question pool"}
              </DialogTitle>
              <DialogDescription>
                Questions are added to pools from the bank. Here you name it and tag its targets.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pool-name">Pool name</Label>
                <Input
                  id="pool-name"
                  name="name"
                  placeholder="LT4 pool"
                  defaultValue={editing?.mode === "edit" ? editing.pool.name : ""}
                  required
                  autoFocus
                />
                <FieldError errors={fieldErrors} name="name" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pool-desc">Description (optional)</Label>
                <Input
                  id="pool-desc"
                  name="description"
                  defaultValue={editing?.mode === "edit" ? (editing.pool.description ?? "") : ""}
                />
              </div>
              <TargetPicker
                targets={targets}
                defaultSelected={editing?.mode === "edit" ? editing.pool.targetIds : []}
              />
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="drawStimulusGroups"
                  className="mt-0.5 size-4 accent-brand"
                  defaultChecked={
                    editing?.mode === "edit" ? editing.pool.drawStimulusGroups : false
                  }
                />
                <span>
                  Draw whole stimulus groups
                  <span className="block text-xs text-muted-foreground">
                    When a draw picks a question that shares a passage or graph, include the rest of
                    its group so the stimulus is never split.
                  </span>
                </span>
              </label>
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
                {editing?.mode === "edit" ? "Save" : "Add pool"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
