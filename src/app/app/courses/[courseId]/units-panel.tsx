"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FieldError, useAction } from "@/components/use-action";
import type { UnitRow } from "@/lib/queries/courses";
import { createUnit, deleteUnit, moveUnit, updateUnit } from "../actions";

export function UnitsPanel({ courseId, units }: { courseId: string; units: UnitRow[] }) {
  const { run, pending, error, fieldErrors } = useAction();
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Units</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-0">
        {units.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground">
            Units group learning targets in order, like &quot;Unit 2 · Cells&quot;.
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {units.map((u, i) =>
              editingId === u.id ? (
                <li key={u.id} className="px-6 py-2">
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(updateUnit(courseId, u.id, new FormData(e.currentTarget)), () =>
                        setEditingId(null)
                      );
                    }}
                  >
                    <Input
                      name="name"
                      defaultValue={u.name}
                      required
                      autoFocus
                      aria-label="Unit name"
                    />
                    <Button type="submit" size="sm" disabled={pending}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                </li>
              ) : (
                <li key={u.id} className="flex items-center gap-2 px-6 py-2 text-sm">
                  <span className="w-5 text-muted-foreground tabular">{i + 1}.</span>
                  <span className="flex-1 font-medium">{u.name}</span>
                  <span className="text-xs text-muted-foreground tabular">
                    {u.targets} {u.targets === 1 ? "target" : "targets"}
                  </span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Move up"
                    disabled={pending || i === 0}
                    onClick={() => run(moveUnit(courseId, u.id, "up"))}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Move down"
                    disabled={pending || i === units.length - 1}
                    onClick={() => run(moveUnit(courseId, u.id, "down"))}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Rename ${u.name}`}
                    onClick={() => setEditingId(u.id)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Delete ${u.name}`}
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Delete "${u.name}"? Its targets are kept, just unfiled.`))
                        run(deleteUnit(courseId, u.id));
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              )
            )}
          </ol>
        )}
        <form
          className="flex gap-2 border-t border-border px-6 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            run(createUnit(courseId, new FormData(form)), () => form.reset());
          }}
        >
          <div className="flex-1">
            <Input
              name="name"
              placeholder="Add a unit, e.g. Unit 2 · Cells"
              aria-label="New unit name"
              required
            />
            <FieldError errors={fieldErrors} name="name" />
          </div>
          <Button type="submit" variant="secondary" disabled={pending}>
            Add
          </Button>
        </form>
        {error ? <p className="px-6 text-sm text-error-foreground">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
