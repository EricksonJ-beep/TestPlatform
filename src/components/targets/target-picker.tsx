"use client";

import { useId, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "cn";
import { TargetChip } from "./target-chip";

export type PickableTarget = { id: string; code: string; title: string };

/**
 * Multi-select for learning targets. Submits as repeated `<input name={name}>`
 * hidden fields so plain FormData works in server actions.
 */
export function TargetPicker({
  targets,
  name = "targetIds",
  defaultSelected = [],
  label = "Learning targets",
  className,
}: {
  targets: PickableTarget[];
  name?: string;
  defaultSelected?: string[];
  label?: string;
  className?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelected));
  const [query, setQuery] = useState("");
  const id = useId();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter(
      (t) => t.code.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)
    );
  }, [targets, query]);

  function toggle(targetId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  }

  return (
    <fieldset className={cn("grid gap-2", className)}>
      <legend className="text-sm font-medium">{label}</legend>
      {Array.from(selected).map((tid) => (
        <input key={tid} type="hidden" name={name} value={tid} />
      ))}
      {targets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No learning targets in this course yet. Add them on the course page.
        </p>
      ) : (
        <>
          {selected.size > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {targets
                .filter((t) => selected.has(t.id))
                .map((t) => (
                  <TargetChip key={t.id} code={t.code} title={t.title} />
                ))}
            </div>
          ) : null}
          {targets.length > 6 ? (
            <label className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2 text-sm text-muted-foreground focus-within:border-brand">
              <Search className="size-3.5" aria-hidden />
              <input
                id={`${id}-search`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter targets"
                className="w-full bg-transparent text-foreground outline-none"
              />
            </label>
          ) : null}
          <ul className="max-h-48 divide-y overflow-auto rounded-md border border-border">
            {visible.map((t) => (
              <li key={t.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                  />
                  <span className="font-medium">{t.code}</span>
                  <span className="truncate text-muted-foreground">{t.title}</span>
                </label>
              </li>
            ))}
            {visible.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">No matches.</li>
            ) : null}
          </ul>
        </>
      )}
    </fieldset>
  );
}
