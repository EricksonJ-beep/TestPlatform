"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ClipboardCheck,
  Download,
  Hand,
  LayoutGrid,
  MessageSquareText,
  Presentation,
} from "lucide-react";
import { cn } from "cn";
import {
  needsCount,
  nextSort,
  parseSort,
  periodLabel,
  serializeSort,
  sortResults,
  statusText,
  SORT_KEYS,
  type ResultsRow,
  type Sort,
  type SortKey,
} from "@/lib/results-table";

/**
 * The sort is remembered per browser (localStorage), like the sidebar and the practice rows: Jon
 * comes back to Results from the sidebar, whose link would drop a `?sort=` from the URL.
 * useSyncExternalStore keeps the server render (default sort) and the browser's choice in sync.
 */
const STORAGE_KEY = "bloom.results.sort";
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
function readSort(): string {
  try {
    return (cached = localStorage.getItem(STORAGE_KEY) ?? "");
  } catch {
    return cached ?? "";
  }
}
function writeSort(s: Sort) {
  const value = serializeSort(s);
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode etc. */
  }
  cached = value;
  listeners.forEach((cb) => cb());
}

const LABEL: Record<SortKey, string> = {
  title: "Assessment",
  class: "Class",
  unit: "Unit",
  status: "Status",
  turnedIn: "In",
  average: "Avg",
  needs: "Needs you",
};
/** What a header means, for its tooltip and screen readers. */
const HELP: Partial<Record<SortKey, string>> = {
  turnedIn: "Turned in",
  average: "Class average of the counting score",
};

const TYPE_MARK = {
  formative: {
    letter: "Q",
    name: "Quiz",
    plural: "Quizzes",
    style: "bg-brand-soft text-brand-deep",
  },
  summative: { letter: "T", name: "Test", plural: "Tests", style: "bg-coral-soft text-[#B93E27]" },
  practice: {
    letter: "P",
    name: "Practice",
    plural: "Practice",
    style: "bg-muted text-muted-foreground",
  },
} as const;

type Filter = { cls: string; type: string; status: string };

/** One row per assignment: sortable headers at laptop width, a stacked compact row on a phone. */
export function ResultsTable({ rows, now }: { rows: ResultsRow[]; now: number }) {
  const sort = parseSort(useSyncExternalStore(subscribe, readSort, () => ""));
  const [filter, setFilter] = useState<Filter>({ cls: "", type: "", status: "" });
  const at = new Date(now);

  const classes = [...new Map(rows.map((r) => [periodLabel(r), r.className])).entries()].sort(
    ([a], [b]) => a.localeCompare(b, "en", { numeric: true })
  );
  const types = (["formative", "summative", "practice"] as const).filter((t) =>
    rows.some((r) => r.type === t)
  );
  const statuses = (["open", "scheduled", "closed"] as const).filter((s) =>
    rows.some((r) => r.status === s)
  );
  const shown = sortResults(
    rows.filter(
      (r) =>
        (!filter.cls || periodLabel(r) === filter.cls) &&
        (!filter.type || r.type === filter.type) &&
        (!filter.status || r.status === filter.status)
    ),
    sort
  );
  const filtering = !!(filter.cls || filter.type || filter.status);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 text-sm md:flex md:flex-wrap md:items-center">
        {classes.length > 1 ? (
          <select
            aria-label="Class"
            value={filter.cls}
            onChange={(e) => setFilter({ ...filter, cls: e.target.value })}
            className={selectClass}
          >
            <option value="">All classes</option>
            {classes.map(([label, name]) => (
              <option key={label} value={label}>
                {label === name ? name : `${label} · ${name}`}
              </option>
            ))}
          </select>
        ) : null}
        {types.length > 1 ? (
          <select
            aria-label="Type"
            value={filter.type}
            onChange={(e) => setFilter({ ...filter, type: e.target.value })}
            className={selectClass}
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {TYPE_MARK[t].plural}
              </option>
            ))}
          </select>
        ) : null}
        {statuses.length > 1 ? (
          <select
            aria-label="Status"
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            className={selectClass}
          >
            <option value="">Any status</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        ) : null}
        {/* Phones have no headers to click: the sort is a menu and an arrow. */}
        <span className="flex items-center gap-1 md:hidden">
          <select
            aria-label="Sort by"
            value={sort.key}
            onChange={(e) => writeSort(nextSort(sort, e.target.value as SortKey))}
            className={cn(selectClass, "min-w-0 flex-1")}
          >
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {k === "turnedIn" ? "Turned in" : k === "average" ? "Average" : LABEL[k]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => writeSort(nextSort(sort, sort.key))}
            aria-label={
              sort.dir === "asc"
                ? "Ascending; switch to descending"
                : "Descending; switch to ascending"
            }
            className="inline-flex size-8 items-center justify-center rounded-lg border border-input bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {sort.dir === "asc" ? (
              <ArrowUp className="size-4" aria-hidden />
            ) : (
              <ArrowDown className="size-4" aria-hidden />
            )}
          </button>
        </span>
        <span className="hidden text-xs text-muted-foreground tabular md:ml-auto md:inline">
          {filtering ? `${shown.length} of ${rows.length}` : rows.length}{" "}
          {rows.length === 1 ? "assignment" : "assignments"}
        </span>
      </div>

      <div data-results-list>
        {/* Laptop and up: one line per assignment. */}
        <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <Header k="title" sort={sort} className="pl-3" />
                <Header k="class" sort={sort} />
                <Header k="unit" sort={sort} className="hidden lg:table-cell" />
                <Header k="status" sort={sort} />
                <Header k="turnedIn" sort={sort} align="right" />
                <Header k="average" sort={sort} align="right" />
                <Header k="needs" sort={sort} />
                <th scope="col" className="w-0 px-2 py-1.5 pr-3">
                  <span className="sr-only">More</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-0 hover:bg-muted/40"
                  data-result-row
                >
                  <td className="max-w-0 py-1.5 pr-2 pl-3 lg:w-[34%]">
                    <span className="flex min-w-0 items-center gap-2">
                      <TypeMark type={r.type} />
                      <Link
                        href={`/app/results/${r.id}`}
                        className="truncate rounded-sm font-medium outline-none hover:text-brand-deep hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                        title={r.title}
                      >
                        {r.title}
                      </Link>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap tabular" title={r.className}>
                    {periodLabel(r)}
                  </td>
                  <td className="hidden max-w-[11rem] truncate px-2 py-1.5 text-muted-foreground lg:table-cell">
                    {r.unitName ?? <span aria-label="No unit">—</span>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <Status row={r} now={at} />
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <TurnedIn row={r} />
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <Average row={r} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Needs row={r} />
                  </td>
                  <td className="py-1.5 pr-3 pl-2">
                    <More row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 ? <Nothing /> : null}
        </div>

        {/* Phone: a stacked compact row. */}
        <ul className="divide-y divide-border rounded-lg border border-border bg-card md:hidden">
          {shown.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <TypeMark type={r.type} />
                <Link
                  href={`/app/results/${r.id}`}
                  className="min-w-0 flex-1 truncate rounded-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {r.title}
                </Link>
                <Needs row={r} />
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span className="text-foreground tabular">{periodLabel(r)}</span>
                <Status row={r} now={at} />
                <TurnedIn row={r} />
                <Average row={r} />
                <span className="ml-auto">
                  <More row={r} />
                </span>
              </span>
            </li>
          ))}
          {shown.length === 0 ? (
            <li>
              <Nothing />
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

const selectClass =
  "border-input bg-card h-8 w-full min-w-0 rounded-lg border px-2 text-sm outline-none md:w-auto focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Header({
  k,
  sort,
  align,
  className,
}: {
  k: SortKey;
  sort: Sort;
  align?: "right";
  className?: string;
}) {
  const active = sort.key === k;
  const Arrow = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "px-2 py-1 text-left font-medium whitespace-nowrap",
        align === "right" && "text-right",
        className
      )}
    >
      <button
        type="button"
        onClick={() => writeSort(nextSort(sort, k))}
        title={HELP[k]}
        className={cn(
          "group inline-flex items-center gap-1 rounded-sm py-0.5 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          active && "text-foreground",
          align === "right" && "flex-row-reverse"
        )}
      >
        {LABEL[k]}
        {HELP[k] ? <span className="sr-only"> ({HELP[k]})</span> : null}
        <Arrow
          className={cn(
            "size-3",
            !active && "opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60"
          )}
          aria-hidden
        />
      </button>
    </th>
  );
}

function TypeMark({ type }: { type: ResultsRow["type"] }) {
  const m = TYPE_MARK[type];
  return (
    <span
      title={m.name}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded text-[0.65rem] font-semibold",
        m.style
      )}
    >
      <span aria-hidden>{m.letter}</span>
      <span className="sr-only">{m.name}:</span>
    </span>
  );
}

function Status({ row, now }: { row: ResultsRow; now: Date }) {
  const s = statusText(row, now);
  const dot =
    row.status === "open"
      ? s.soon
        ? "bg-warning"
        : "bg-success"
      : row.status === "scheduled"
        ? "border border-warning bg-transparent"
        : "bg-muted-foreground/40";
  return (
    <span
      title={s.long}
      className={cn(
        "inline-flex items-center gap-1.5 tabular",
        row.status === "closed" ? "text-muted-foreground" : "text-foreground",
        s.soon && "font-medium text-warning-foreground"
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", dot)} aria-hidden />
      <span className="sr-only">{s.long}</span>
      <span aria-hidden>{s.short}</span>
    </span>
  );
}

function TurnedIn({ row }: { row: ResultsRow }) {
  const all = row.enrolled > 0 && row.submitted >= row.enrolled;
  const label = `${row.submitted} of ${row.enrolled} turned in${row.inProgress > 0 ? `, ${row.inProgress} in progress` : ""}`;
  return (
    <span className="tabular" title={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden>
        <span className={cn(all ? "text-success-foreground" : "text-foreground")}>
          {row.submitted}
        </span>
        <span className="text-muted-foreground">/{row.enrolled}</span>
        {row.inProgress > 0 ? (
          <span className="ml-1 text-xs text-muted-foreground">+{row.inProgress}</span>
        ) : null}
      </span>
    </span>
  );
}

function Average({ row }: { row: ResultsRow }) {
  if (row.average === null)
    return (
      <span className="text-muted-foreground" title="No scores yet">
        <span aria-hidden>—</span>
        <span className="sr-only">No scores yet</span>
      </span>
    );
  const label = `Average ${Math.round(row.average)}%${row.median !== null ? `, median ${Math.round(row.median)}%` : ""}, ${row.scored} scored`;
  return (
    <span className="font-medium tabular" title={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden>{Math.round(row.average)}%</span>
    </span>
  );
}

/** What waits on the teacher, as small counts that open where each is handled. */
function Needs({ row }: { row: ResultsRow }) {
  if (needsCount(row) === 0) return null;
  const flags = row.requests + row.asks;
  const chip =
    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
  return (
    <span className="flex shrink-0 items-center gap-1">
      {row.toGrade > 0 ? (
        <Link
          href={`/app/results/grading?assignment=${row.id}`}
          className={cn(chip, "bg-warning-soft text-warning-foreground hover:bg-warning-soft/70")}
          aria-label={`${row.toGrade} ${row.toGrade === 1 ? "answer" : "answers"} to grade`}
          title={`${row.toGrade} to grade`}
        >
          <ClipboardCheck className="size-3" aria-hidden />
          {row.toGrade}
        </Link>
      ) : null}
      {row.corrections > 0 ? (
        <Link
          href={`/app/results/corrections?assignment=${row.id}`}
          className={cn(chip, "bg-brand-soft text-brand-deep hover:bg-brand-soft/70")}
          aria-label={`${row.corrections} correction ${row.corrections === 1 ? "set" : "sets"} to approve`}
          title={`${row.corrections} correction ${row.corrections === 1 ? "set" : "sets"} to approve`}
        >
          <MessageSquareText className="size-3" aria-hidden />
          {row.corrections}
        </Link>
      ) : null}
      {flags > 0 ? (
        <Link
          href={`/app/results/${row.id}`}
          className={cn(chip, "bg-coral-soft text-[#B93E27] hover:bg-coral-soft/70")}
          aria-label={flagText(row)}
          title={flagText(row)}
        >
          <Hand className="size-3" aria-hidden />
          {flags}
        </Link>
      ) : null}
    </span>
  );
}

function flagText(r: ResultsRow): string {
  return [
    r.requests > 0 ? `${r.requests} retake ${r.requests === 1 ? "request" : "requests"}` : null,
    r.asks > 0 ? `${r.asks} asking to finish` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** The assignment's other pages, as small icons (each named for screen readers and on hover). */
function More({ row }: { row: ResultsRow }) {
  const icon =
    "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";
  return (
    <span className="flex items-center justify-end gap-0.5">
      {row.type === "summative" ? (
        <Link
          href={`/app/results/${row.id}/tiers`}
          className={icon}
          aria-label={`Tier board: ${row.title}, ${periodLabel(row)}`}
          title="Tier board"
        >
          <LayoutGrid className="size-4" aria-hidden />
        </Link>
      ) : null}
      <Link
        href={`/app/results/${row.id}/review`}
        className={cn(icon, "max-md:hidden")}
        aria-label={`Review with the class: ${row.title}, ${periodLabel(row)}`}
        title="Review with the class"
      >
        <Presentation className="size-4" aria-hidden />
      </Link>
      <Link
        href={`/app/results/${row.id}/skyward`}
        className={icon}
        aria-label={`Skyward export: ${row.title}, ${periodLabel(row)}`}
        title="Skyward export"
      >
        <Download className="size-4" aria-hidden />
      </Link>
    </span>
  );
}

function Nothing() {
  return <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches.</p>;
}
