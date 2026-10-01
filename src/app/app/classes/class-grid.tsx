"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpDown, GripVertical } from "lucide-react";
import { cn } from "cn";
import type { ClassSummary } from "@/lib/queries/classes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAction } from "@/components/use-action";
import { reorderClasses } from "./actions";

type SortKey = "period" | "name" | "course" | "newest";

const periodNumber = (p: string | null) => {
  const n = Number((p ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
};

const SORTS: Record<SortKey, { label: string; cmp: (a: ClassSummary, b: ClassSummary) => number }> =
  {
    period: {
      label: "Period",
      cmp: (a, b) =>
        periodNumber(a.period) - periodNumber(b.period) || a.name.localeCompare(b.name),
    },
    name: { label: "Name", cmp: (a, b) => a.name.localeCompare(b.name) },
    course: {
      label: "Course",
      cmp: (a, b) =>
        (a.courseName ?? "zzz").localeCompare(b.courseName ?? "zzz") ||
        periodNumber(a.period) - periodNumber(b.period),
    },
    newest: {
      label: "Newest first",
      cmp: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    },
  };

/**
 * Class cards you can drag into your own order (Jon, Oct 1 2026), or sort in one
 * click; either way the order is saved and comes back next time.
 */
export function ClassGrid({ classes }: { classes: ClassSummary[] }) {
  const [order, setOrder] = useState(classes);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const { run, pending, error } = useAction();

  function commit(next: ClassSummary[]) {
    setOrder(next);
    run(reorderClasses(next.map((c) => c.id)));
  }

  function dropOn(targetId: string) {
    if (!dragging || dragging === targetId) return;
    const from = order.findIndex((c) => c.id === dragging);
    const to = order.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
  }

  function move(id: string, delta: -1 | 1) {
    const from = order.findIndex((c) => c.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    commit(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Drag a card to rearrange, or</span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={pending} />}>
            <ArrowUpDown data-icon="inline-start" aria-hidden />
            Sort by
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Order the cards by</DropdownMenuLabel>
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <DropdownMenuItem key={k} onClick={() => commit([...order].sort(SORTS[k].cmp))}>
                {SORTS[k].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {error ? <span className="text-error-foreground">{error}</span> : null}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-class-grid>
        {order.map((c, i) => (
          <li
            key={c.id}
            draggable
            onDragStart={(e) => {
              setDragging(c.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", c.id);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (over !== c.id) setOver(c.id);
            }}
            onDragLeave={() => over === c.id && setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              dropOn(c.id);
              setDragging(null);
              setOver(null);
            }}
            className={cn(
              "group relative rounded-lg transition-opacity",
              dragging === c.id && "opacity-40",
              over === c.id && dragging !== c.id && "ring-3 ring-brand/40"
            )}
            data-class-card={c.id}
          >
            <Link
              href={`/app/classes/${c.id}`}
              draggable={false}
              className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 pl-9 transition-colors outline-none hover:border-brand/50 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base leading-tight">{c.name}</h2>
                {c.period ? (
                  <span className="shrink-0 rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
                    P{c.period}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {[c.courseName, c.term].filter(Boolean).join(" · ") || "No course set"}
              </p>
              <p className="mt-auto text-xs text-muted-foreground tabular">
                {c.students} {c.students === 1 ? "student" : "students"}
              </p>
            </Link>
            <span
              className="absolute top-3 left-2 cursor-grab text-muted-foreground/60 group-hover:text-muted-foreground active:cursor-grabbing"
              title="Drag to rearrange"
              aria-hidden
            >
              <GripVertical className="size-5" />
            </span>
            {/* Keyboard fallback for the drag: move earlier / later. */}
            <span className="absolute right-2 bottom-2 hidden gap-0.5 group-focus-within:inline-flex group-hover:inline-flex">
              <button
                type="button"
                className="rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                disabled={pending || i === 0}
                aria-label={`Move ${c.name} earlier`}
                onClick={() => move(c.id, -1)}
              >
                ←
              </button>
              <button
                type="button"
                className="rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                disabled={pending || i === order.length - 1}
                aria-label={`Move ${c.name} later`}
                onClick={() => move(c.id, 1)}
              >
                →
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
