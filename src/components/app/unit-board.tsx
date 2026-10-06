"use client";

import { useState, type ReactNode } from "react";
import { FolderInput, GripVertical } from "lucide-react";
import { cn } from "cn";
import type { ActionResult } from "@/lib/authz";
import { nudgeCard, placeCard, type CourseShelves, type Shelved } from "@/lib/unit-shelves";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAction } from "@/components/use-action";
import { AdoptButton } from "@/components/app/adopt-button";

export type BoardCard = Shelved & { name: string; node: ReactNode };

type Props = {
  /** The current course's shelves (docs/course-focus-plan.md: one course at a time). */
  course: CourseShelves<BoardCard>;
  /** Cards that belong to no course; listed under the board so they never vanish. */
  orphans?: BoardCard[];
  /** With this, each orphan gets a "Put in {course}" button (ticket 8). */
  adoptInto?: { type: "question_bank" | "assessment"; course: { id: string; name: string } };
  noun: string;
  place: (
    id: string,
    unitId: string | null,
    orderedIds: string[]
  ) => Promise<ActionResult<unknown>>;
};

const courseKey = (id: string | null) => id ?? "none";

/**
 * The current course's unit shelves with drag-and-drop (Jon, Oct 2 2026:
 * "organize the banks into units like Google Classroom… I don't want to
 * scroll a bunch for each class"; Oct 6: the course comes from the sidebar
 * switcher, so the tabs are gone). Units with cards are open shelves; empty
 * units collapse into one strip of chips that still take a drop; cards with
 * no unit sit last under "No unit yet". Drop a card on another card to slot
 * in front of it, or on a unit header / chip to put it at the end of that
 * unit. Keyboard: ← → nudge within the shelf, and a "Move to" menu lists the
 * course's units.
 */
export function UnitBoard({ course: initial, orphans = [], adoptInto, noun, place }: Props) {
  const [course, setCourse] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const { run, pending, error } = useAction();

  function apply(moved: string, result: { unitId: string | null; orderedIds: string[] }) {
    const card = course.shelves.flatMap((s) => s.items).find((x) => x.id === moved)!;
    setCourse({
      ...course,
      shelves: course.shelves.map((s) => {
        const kept = s.items.filter((x) => x.id !== moved);
        if (s.unitId !== result.unitId) return { ...s, items: kept };
        const byId = new Map(kept.map((x) => [x.id, x]));
        byId.set(moved, { ...card, unitId: s.unitId });
        return {
          ...s,
          items: result.orderedIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
        };
      }),
    });
    run(place(moved, result.unitId, result.orderedIds));
  }

  function drop(target: { cardId: string } | { unitId: string | null }) {
    if (!dragging) return;
    const result = placeCard(course.shelves, dragging, target);
    if (result) apply(dragging, result);
    setDragging(null);
    setOver(null);
  }

  const dragProps = (key: string, onDrop: () => void) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (over !== key) setOver(key);
    },
    onDragLeave: () => over === key && setOver(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      onDrop();
    },
  });

  const filled = course.shelves.filter((s) => s.items.length > 0 && s.unitId !== null);
  const empty = course.shelves.filter((s) => s.items.length === 0 && s.unitId !== null);
  const loose = course.shelves.find((s) => s.unitId === null);
  const canDropOn = (shelf: { items: { id: string }[] }) =>
    dragging !== null && !shelf.items.some((i) => i.id === dragging);

  const shelfHeader = (shelf: (typeof course.shelves)[number]) => {
    const key = `${courseKey(course.courseId)}:${courseKey(shelf.unitId)}`;
    return (
      <h3
        {...dragProps(key, () => drop({ unitId: shelf.unitId }))}
        className={cn(
          "flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm font-medium text-muted-foreground transition-colors",
          over === key && canDropOn(shelf) && "border-brand/50 bg-brand-soft text-brand-deep"
        )}
      >
        {shelf.name}
        <span className="font-normal tabular">· {shelf.items.length}</span>
      </h3>
    );
  };

  const cardList = (shelf: (typeof course.shelves)[number]) => (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shelf.items.map((card, i) => (
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
          {...dragProps(card.id, () => drop({ cardId: card.id }))}
          className={cn(
            "group relative rounded-lg transition-opacity",
            dragging === card.id && "opacity-40",
            over === card.id && dragging !== card.id && "ring-3 ring-brand/40"
          )}
          data-shelf-card={card.id}
        >
          {card.node}
          <span
            className="absolute top-3 left-2 cursor-grab text-muted-foreground/60 group-hover:text-muted-foreground active:cursor-grabbing"
            title="Drag to rearrange"
            aria-hidden
          >
            <GripVertical className="size-5" />
          </span>
          <span className="absolute right-2 bottom-2 hidden items-center gap-0.5 group-focus-within:inline-flex group-hover:inline-flex">
            <button
              type="button"
              className="rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              disabled={pending || i === 0}
              aria-label={`Move ${card.name} earlier`}
              onClick={() => {
                const ids = nudgeCard(shelf, card.id, -1);
                if (ids) apply(card.id, { unitId: shelf.unitId, orderedIds: ids });
              }}
            >
              ←
            </button>
            <button
              type="button"
              className="rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
              disabled={pending || i === shelf.items.length - 1}
              aria-label={`Move ${card.name} later`}
              onClick={() => {
                const ids = nudgeCard(shelf, card.id, 1);
                if (ids) apply(card.id, { unitId: shelf.unitId, orderedIds: ids });
              }}
            >
              →
            </button>
            {course.shelves.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Move ${card.name} to another unit`}
                  disabled={pending}
                >
                  <FolderInput className="size-3.5" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Move to</DropdownMenuLabel>
                    {course.shelves
                      .filter((s) => s.unitId !== shelf.unitId)
                      .map((s) => (
                        <DropdownMenuItem
                          key={courseKey(s.unitId)}
                          onClick={() => {
                            const r = placeCard(course.shelves, card.id, { unitId: s.unitId });
                            if (r) apply(card.id, r);
                          }}
                        >
                          {s.name}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Drag a card onto a unit, or in front of another card, to organize it.
        {error ? <span className="ml-2 text-error-foreground">{error}</span> : null}
      </p>

      <section
        key={courseKey(course.courseId)}
        className="flex flex-col gap-4"
        aria-label={course.course}
      >
        {filled.length === 0 && (!loose || loose.items.length === 0) ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No {noun}s in {course.course} yet.
          </p>
        ) : null}
        {filled.map((shelf) => (
          <div
            key={courseKey(shelf.unitId)}
            className="flex flex-col gap-2"
            data-unit-shelf={shelf.unitId}
          >
            {shelfHeader(shelf)}
            {cardList(shelf)}
          </div>
        ))}
        {empty.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 px-2 text-xs text-muted-foreground">
            <span className="font-medium">Empty units:</span>
            {empty.map((shelf) => {
              const key = `${courseKey(course.courseId)}:${courseKey(shelf.unitId)}`;
              return (
                <span
                  key={key}
                  {...dragProps(key, () => drop({ unitId: shelf.unitId }))}
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
        {loose && loose.items.length > 0 ? (
          <div className="flex flex-col gap-2" data-unit-shelf="">
            {shelfHeader(loose)}
            {cardList(loose)}
          </div>
        ) : null}
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
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {orphans.map((card) => (
              <li key={card.id} className="relative flex flex-col gap-2" data-card={card.id}>
                {card.node}
                {adoptInto ? (
                  <AdoptButton
                    item={{ type: adoptInto.type, id: card.id }}
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
