"use client";

import { useState, type ReactNode } from "react";
import { ArrowDownUp, FolderInput, GripVertical } from "lucide-react";
import { cn } from "cn";
import {
  BANK_KIND_LABEL,
  BANK_KINDS,
  bankKind,
  groupByKind,
  placeInColumn,
  type BankKind,
} from "@/lib/bank-kinds";
import type { CourseShelves } from "@/lib/unit-shelves";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAction } from "@/components/use-action";
import { AdoptButton } from "@/components/app/adopt-button";
import { autoOrderColumn, placeBankInColumn } from "@/app/app/banks/actions";

export type BankCard = {
  id: string;
  name: string;
  courseId: string | null;
  courseName: string | null;
  unitId: string | null;
  sortOrder: number;
  kind: string | null;
  kindOrder: number | null;
  node: ReactNode;
};

const unitKey = (id: string | null) => id ?? "none";

/**
 * The Question banks page for the current course (Jon, Oct 13 2026): one shelf
 * per unit, and inside each a column per bank type (Practice, Quiz, Test,
 * Retake, plus "Other" when a name says none of them). Columns start in
 * automatic order (LT1 above LT2); dragging a card sets its unit, its type and
 * the column's order, and "Auto-order" hands a column back. Empty units are
 * chips that take a drop. Keyboard: ↑ ↓ move within a column, and a "Move to"
 * menu lists the types and the units.
 */
export function BankBoard({
  course,
  orphans = [],
  adoptInto,
}: {
  course: CourseShelves<BankCard>;
  orphans?: BankCard[];
  adoptInto?: { course: { id: string; name: string } };
}) {
  const [items, setItems] = useState(() => course.shelves.flatMap((s) => s.items));
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const { run, pending, error } = useAction();

  const shelves = course.shelves.map((s) => {
    const mine = items.filter((i) => i.unitId === s.unitId);
    return { unitId: s.unitId, name: s.name, count: mine.length, columns: groupByKind(mine) };
  });

  /** Move `id` into `unitId`'s `kind` column with that column's new order, then save. */
  function apply(id: string, unitId: string | null, kind: BankKind, orderedIds: string[]) {
    const order = new Map(orderedIds.map((x, i) => [x, i]));
    setItems((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, unitId, kind, kindOrder: order.get(id) ?? null }
          : order.has(b.id)
            ? { ...b, kindOrder: order.get(b.id)! }
            : b
      )
    );
    run(placeBankInColumn(id, unitId, kind, orderedIds));
  }

  /** Put a card at the end of a unit's column (its own type unless one is given). */
  function sendTo(id: string, unitId: string | null, kind?: BankKind) {
    const card = items.find((b) => b.id === id);
    if (!card) return;
    const k = kind ?? bankKind(card);
    const column = groupByKind(items.filter((b) => b.unitId === unitId && b.id !== id)).find(
      (c) => c.kind === k
    );
    apply(id, unitId, k, [...(column?.items.map((b) => b.id) ?? []), id]);
  }

  function dropOnColumn(unitId: string | null, target: { cardId: string } | { kind: BankKind }) {
    if (!dragging) return;
    const shelf = shelves.find((s) => s.unitId === unitId);
    // A card from another unit joins this unit's columns before placing.
    const card = items.find((b) => b.id === dragging);
    const columns = shelf?.columns ?? [];
    const withOther =
      "kind" in target && !columns.some((c) => c.kind === target.kind)
        ? [...columns, { kind: target.kind, items: [] }]
        : columns;
    const r = placeInColumn(withOther, dragging, target);
    if (r && card) apply(dragging, unitId, r.kind, r.orderedIds);
    setDragging(null);
    setOver(null);
  }

  function dropOnUnit(unitId: string | null) {
    if (dragging) sendTo(dragging, unitId);
    setDragging(null);
    setOver(null);
  }

  const dragProps = (key: string, onDrop: () => void) => ({
    // Cards sit inside a column that is a drop target too: the innermost target handles it.
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (over !== key) setOver(key);
    },
    onDragLeave: () => over === key && setOver(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDrop();
    },
  });

  const filled = shelves.filter((s) => s.count > 0 && s.unitId !== null);
  const empty = shelves.filter((s) => s.count === 0 && s.unitId !== null);
  const loose = shelves.find((s) => s.unitId === null && s.count > 0);

  const cardItem = (
    card: BankCard,
    shelf: (typeof shelves)[number],
    column: (typeof shelf.columns)[number],
    i: number
  ) => (
    <li
      key={card.id}
      draggable
      onDragStart={(e) => {
        setDragging(card.id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.id);
      }}
      onDragEnd={() => {
        setDragging(null);
        setOver(null);
      }}
      {...dragProps(card.id, () => dropOnColumn(shelf.unitId, { cardId: card.id }))}
      className={cn(
        "group relative rounded-lg transition-opacity",
        dragging === card.id && "opacity-40",
        over === card.id && dragging !== card.id && "ring-3 ring-brand/40"
      )}
      data-shelf-card={card.id}
    >
      {card.node}
      <span
        className="absolute top-2.5 left-1.5 cursor-grab text-muted-foreground/60 group-hover:text-muted-foreground active:cursor-grabbing"
        title="Drag to rearrange"
        aria-hidden
      >
        <GripVertical className="size-4" />
      </span>
      <span className="absolute right-1.5 bottom-1.5 hidden items-center gap-0.5 group-focus-within:inline-flex group-hover:inline-flex group-has-[[data-popup-open]]:inline-flex">
        <button
          type="button"
          className="rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          disabled={pending || i === 0}
          aria-label={`Move ${card.name} up`}
          onClick={() => {
            const ids = column.items.map((b) => b.id);
            [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
            apply(card.id, shelf.unitId, column.kind, ids);
          }}
        >
          ↑
        </button>
        <button
          type="button"
          className="rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          disabled={pending || i === column.items.length - 1}
          aria-label={`Move ${card.name} down`}
          onClick={() => {
            const ids = column.items.map((b) => b.id);
            [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
            apply(card.id, shelf.unitId, column.kind, ids);
          }}
        >
          ↓
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Move ${card.name} to another type or unit`}
            disabled={pending}
          >
            <FolderInput className="size-3.5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-max max-w-80">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Type</DropdownMenuLabel>
              {BANK_KINDS.filter((k) => k !== column.kind).map((k) => (
                <DropdownMenuItem key={k} onClick={() => sendTo(card.id, shelf.unitId, k)}>
                  {BANK_KIND_LABEL[k]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {shelves.length > 1 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Unit</DropdownMenuLabel>
                  {shelves
                    .filter((s) => s.unitId !== shelf.unitId)
                    .map((s) => (
                      <DropdownMenuItem
                        key={unitKey(s.unitId)}
                        onClick={() => sendTo(card.id, s.unitId)}
                      >
                        {s.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </li>
  );

  const shelfView = (shelf: (typeof shelves)[number]) => {
    const headKey = `unit:${unitKey(shelf.unitId)}`;
    return (
      <div
        key={unitKey(shelf.unitId)}
        className="flex flex-col gap-2"
        data-unit-shelf={shelf.unitId ?? ""}
      >
        <h3
          {...dragProps(headKey, () => dropOnUnit(shelf.unitId))}
          className={cn(
            "flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm font-medium text-muted-foreground transition-colors",
            over === headKey && dragging && "border-brand/50 bg-brand-soft text-brand-deep"
          )}
        >
          {shelf.name}
          <span className="font-normal tabular">· {shelf.count}</span>
        </h3>
        <div
          className={cn(
            "grid gap-3 sm:grid-cols-2",
            shelf.columns.length > 4 ? "lg:grid-cols-5" : "lg:grid-cols-4"
          )}
        >
          {shelf.columns.map((column) => {
            const key = `col:${unitKey(shelf.unitId)}:${column.kind}`;
            const hand = column.items.some((b) => b.kindOrder !== null);
            return (
              <section
                key={column.kind}
                aria-label={`${shelf.name} · ${BANK_KIND_LABEL[column.kind]}`}
                data-kind-column={column.kind}
                {...dragProps(key, () => dropOnColumn(shelf.unitId, { kind: column.kind }))}
                className={cn(
                  "flex min-h-24 flex-col gap-2 rounded-lg bg-muted/40 p-2 transition-colors",
                  over === key && dragging && "bg-brand-soft ring-2 ring-brand/40"
                )}
              >
                <div className="flex items-center gap-1 px-1">
                  <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {BANK_KIND_LABEL[column.kind]}
                    <span className="ml-1 font-normal tabular">· {column.items.length}</span>
                  </h4>
                  {hand ? (
                    <button
                      type="button"
                      className="ml-auto inline-flex items-center gap-0.5 rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Order this column automatically: LT1, LT2, LT3…"
                      disabled={pending}
                      onClick={() => {
                        const ids = column.items.map((b) => b.id);
                        setItems((prev) =>
                          prev.map((b) => (ids.includes(b.id) ? { ...b, kindOrder: null } : b))
                        );
                        run(autoOrderColumn(ids));
                      }}
                    >
                      <ArrowDownUp className="size-3" aria-hidden />
                      Auto-order
                    </button>
                  ) : null}
                </div>
                {column.items.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-2 py-4 text-center text-xs text-muted-foreground">
                    Drop a bank here
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {column.items.map((card, i) => cardItem(card, shelf, column, i))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Drag a card to another column or unit, or up and down to reorder it. Bloom sorts each column
        by learning target until you arrange it yourself.
        {error ? <span className="ml-2 text-error-foreground">{error}</span> : null}
      </p>

      <section className="flex flex-col gap-6" aria-label={course.course}>
        {filled.length === 0 && !loose ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No banks in {course.course} yet.
          </p>
        ) : null}
        {filled.map(shelfView)}
        {empty.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 px-2 text-xs text-muted-foreground">
            <span className="font-medium">Empty units:</span>
            {empty.map((shelf) => {
              const key = `unit:${unitKey(shelf.unitId)}`;
              return (
                <span
                  key={key}
                  {...dragProps(key, () => dropOnUnit(shelf.unitId))}
                  data-unit-chip={shelf.unitId}
                  className={cn(
                    "rounded-full border border-dashed border-border px-2.5 py-1 transition-colors",
                    dragging && "border-brand/40",
                    over === key && dragging && "border-brand bg-brand-soft text-brand-deep"
                  )}
                >
                  {shelf.name}
                </span>
              );
            })}
          </div>
        ) : null}
        {loose ? shelfView(loose) : null}
      </section>

      {orphans.length > 0 ? (
        <section
          className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3"
          aria-label="Not in any course"
          data-orphans
        >
          <h3 className="px-1 text-sm font-medium text-muted-foreground">
            Not in any course <span className="font-normal tabular">· {orphans.length}</span>
            <span className="ml-2 font-normal">
              {adoptInto
                ? `Put one in ${adoptInto.course.name} and it files under that course's units.`
                : "Open one and give it a course so it files under its units."}
            </span>
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {orphans.map((card) => (
              <li key={card.id} className="relative flex flex-col gap-2" data-card={card.id}>
                {card.node}
                {adoptInto ? (
                  <AdoptButton
                    item={{ type: "question_bank", id: card.id }}
                    course={adoptInto.course}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
