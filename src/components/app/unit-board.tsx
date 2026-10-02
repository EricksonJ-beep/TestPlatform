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

export type BoardCard = Shelved & { name: string; node: ReactNode };

type Props = {
  courses: CourseShelves<BoardCard>[];
  noun: string;
  place: (
    id: string,
    unitId: string | null,
    orderedIds: string[]
  ) => Promise<ActionResult<unknown>>;
};

/**
 * Course → unit shelves with drag-and-drop (Jon, Oct 2 2026: "organize the
 * banks into units like Google Classroom, and drag the assessments around").
 * Drop a card on another card to slot in front of it, or on a unit header
 * to put it at the end of that unit. Keyboard: ← → nudge within the shelf,
 * and a "Move to" menu lists the course's units.
 */
export function UnitBoard({ courses: initial, noun, place }: Props) {
  const [courses, setCourses] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const { run, pending, error } = useAction();

  function apply(
    courseIndex: number,
    moved: string,
    result: { unitId: string | null; orderedIds: string[] }
  ) {
    const next = courses.map((c, i) => {
      if (i !== courseIndex) return c;
      const all = c.shelves.flatMap((s) => s.items);
      const card = all.find((x) => x.id === moved)!;
      return {
        ...c,
        shelves: c.shelves.map((s) => {
          const kept = s.items.filter((x) => x.id !== moved);
          if (s.unitId !== result.unitId) return { ...s, items: kept };
          const byId = new Map(kept.map((x) => [x.id, x]));
          byId.set(moved, { ...card, unitId: s.unitId });
          return {
            ...s,
            items: result.orderedIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
          };
        }),
      };
    });
    setCourses(next);
    run(place(moved, result.unitId, result.orderedIds));
  }

  function drop(courseIndex: number, target: { cardId: string } | { unitId: string | null }) {
    if (!dragging) return;
    const result = placeCard(courses[courseIndex].shelves, dragging, target);
    if (result) apply(courseIndex, dragging, result);
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

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">
        Drag a card onto a unit header or in front of another card to organize it.
        {error ? <span className="ml-2 text-error-foreground">{error}</span> : null}
      </p>
      {courses.map((course, ci) => {
        const total = course.shelves.reduce((n, s) => n + s.items.length, 0);
        return (
          <section
            key={course.courseId ?? "none"}
            className="flex flex-col gap-4"
            aria-label={course.course}
          >
            <h2 className="text-lg">
              {course.course}{" "}
              <span className="text-sm font-normal text-muted-foreground tabular">
                · {total} {total === 1 ? noun : `${noun}s`}
              </span>
            </h2>
            {course.shelves.map((shelf) => {
              const shelfKey = `${course.courseId}:${shelf.unitId ?? "none"}`;
              const canDropHere = dragging !== null && !shelf.items.some((i) => i.id === dragging);
              return (
                <div
                  key={shelfKey}
                  className="flex flex-col gap-2"
                  data-unit-shelf={shelf.unitId ?? ""}
                >
                  <h3
                    {...dragProps(shelfKey, () => drop(ci, { unitId: shelf.unitId }))}
                    className={cn(
                      "flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm font-medium text-muted-foreground transition-colors",
                      over === shelfKey &&
                        canDropHere &&
                        "border-brand/50 bg-brand-soft text-brand-deep"
                    )}
                  >
                    {shelf.name}
                    {shelf.items.length ? (
                      <span className="font-normal tabular">· {shelf.items.length}</span>
                    ) : null}
                  </h3>
                  {shelf.items.length === 0 ? (
                    <div
                      {...dragProps(`${shelfKey}:empty`, () => drop(ci, { unitId: shelf.unitId }))}
                      className={cn(
                        "rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground",
                        over === `${shelfKey}:empty` &&
                          canDropHere &&
                          "border-brand/60 bg-brand-soft"
                      )}
                    >
                      Nothing here yet. Drop {/^[aeiou]/i.test(noun) ? "an" : "a"} {noun} here.
                    </div>
                  ) : (
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
                          {...dragProps(card.id, () => drop(ci, { cardId: card.id }))}
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
                                if (ids)
                                  apply(ci, card.id, { unitId: shelf.unitId, orderedIds: ids });
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
                                if (ids)
                                  apply(ci, card.id, { unitId: shelf.unitId, orderedIds: ids });
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
                                          key={s.unitId ?? "none"}
                                          onClick={() => {
                                            const r = placeCard(course.shelves, card.id, {
                                              unitId: s.unitId,
                                            });
                                            if (r) apply(ci, card.id, r);
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
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
