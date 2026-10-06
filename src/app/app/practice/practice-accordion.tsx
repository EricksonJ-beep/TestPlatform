"use client";

import { useState, useSyncExternalStore } from "react";
import { AlertTriangle, ChevronRight, Search } from "lucide-react";
import { cn } from "cn";
import {
  ATTENTION_TEXT,
  attentionReasons,
  matchesQuery,
  type CourseGroup,
  type PracticeItem,
} from "@/lib/practice-groups";
import { ContentList } from "./content-list";

const STORAGE_KEY = "bloom.practice.open";

// Which unit rows the teacher left open, per browser (same pattern as the sidebar).
const listeners = new Set<() => void>();
let cached: string | null = null;
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readOpen(): string {
  try {
    return (cached = localStorage.getItem(STORAGE_KEY) ?? "");
  } catch {
    return cached ?? "";
  }
}
function writeOpen(ids: Set<string>) {
  const value = [...ids].join(",");
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode etc. */
  }
  cached = value;
  listeners.forEach((cb) => cb());
}

/**
 * Course headings, then one collapsible row per unit (collapsed by default,
 * remembered), with a Needs-attention row first and a search box that opens
 * whatever matches. Jon, Oct 1 2026.
 */
export function PracticeAccordion({
  groups,
  orphans = [],
  headings = true,
}: {
  groups: CourseGroup[];
  /** Items that belong to no course; listed apart so they never vanish (course focus). */
  orphans?: PracticeItem[];
  /** Course headings are redundant when the sidebar already names the one course shown. */
  headings?: boolean;
}) {
  const [query, setQuery] = useState("");
  const openRaw = useSyncExternalStore(subscribe, readOpen, () => "");
  const open = new Set(openRaw.split(",").filter(Boolean));
  const searching = query.trim().length > 0;

  function toggle(id: string) {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeOpen(next);
  }

  const filtered = groups
    .map((g) => ({
      ...g,
      attention: g.attention.filter((i) => matchesQuery(i, query)),
      // Empty unit rows stay listed (they are where next unit's practice will go);
      // a search shows only units with a match.
      units: g.units
        .map((u) => ({ ...u, items: u.items.filter((i) => matchesQuery(i, query)) }))
        .filter((u) => !searching || u.items.length > 0),
    }))
    .filter((g) => g.attention.length > 0 || g.units.length > 0);
  const shownOrphans = orphans.filter((i) => matchesQuery(i, query));

  return (
    <div className="flex flex-col gap-5" data-practice-accordion>
      <label className="flex h-10 w-full max-w-md items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/30">
        <Search className="size-4 shrink-0" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a set or activity by name or target (U1.LT3, density…)"
          aria-label="Search practice sets and activities"
          className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      {filtered.length === 0 && shownOrphans.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {searching ? <>Nothing matches &ldquo;{query}&rdquo;.</> : "Nothing here yet."}
        </p>
      ) : null}

      {filtered.map((g) => (
        <section key={g.course} className="flex flex-col gap-2" aria-label={g.course}>
          {headings ? (
            <h2 className="text-lg">
              {g.course}{" "}
              <span className="text-sm font-normal text-muted-foreground tabular">
                · {g.total} {g.total === 1 ? "item" : "items"}
              </span>
            </h2>
          ) : null}

          {g.attention.length > 0 ? <AttentionRow items={g.attention} /> : null}

          {g.units.map((u) => {
            const key = `${g.course}:${u.id}`;
            const isOpen = searching || open.has(key);
            return (
              <div
                key={u.id}
                className="rounded-lg border border-border bg-card"
                data-unit-row={u.id}
                data-open={isOpen}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-expanded={isOpen}
                  onClick={() => toggle(key)}
                >
                  <ChevronRight
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-90"
                    )}
                    aria-hidden
                  />
                  <span className="font-medium">{u.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular">
                    {!u.sets && !u.activities ? "nothing yet" : ""}
                    {u.sets ? `${u.sets} ${u.sets === 1 ? "set" : "sets"}` : ""}
                    {u.sets && u.activities ? " · " : ""}
                    {u.activities
                      ? `${u.activities} ${u.activities === 1 ? "activity" : "activities"}`
                      : ""}
                  </span>
                </button>
                {isOpen ? (
                  <div className="border-t border-border">
                    {u.items.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-muted-foreground" data-unit-empty>
                        Nothing here yet. Tag a practice set or activity to a {u.name} target and it
                        files here.
                      </p>
                    ) : (
                      <ContentList items={u.items} bare />
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ))}

      {shownOrphans.length > 0 ? (
        <section
          className="rounded-lg border border-dashed border-border bg-card"
          aria-label="Not in any course"
          data-orphans
        >
          <p className="border-b border-border px-4 py-2 text-sm font-medium text-muted-foreground">
            Not in any course <span className="font-normal tabular">· {shownOrphans.length}</span>
            <span className="ml-2 font-normal">
              Open one and give it a course so it files under its units.
            </span>
          </p>
          <ContentList items={shownOrphans} bare />
        </section>
      ) : null}
    </div>
  );
}

function AttentionRow({ items }: { items: PracticeItem[] }) {
  return (
    <div className="rounded-lg border border-warning/50 bg-card" data-attention-row>
      <p className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm font-medium text-warning-foreground">
        <AlertTriangle className="size-4" aria-hidden />
        Needs attention
        <span className="font-normal text-muted-foreground">
          ·{" "}
          {items
            .map((i) =>
              attentionReasons(i)
                .map((r) => ATTENTION_TEXT[r])
                .join(", ")
            )
            .filter((v, k, a) => a.indexOf(v) === k)
            .join(" · ")}
        </span>
      </p>
      <ContentList items={items} bare />
    </div>
  );
}
