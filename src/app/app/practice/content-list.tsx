"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, BookOpen, FileText, Layers, Link2, PlayCircle } from "lucide-react";
import { KIND_LABEL } from "@/lib/practice-rules";
import type { ActivitySummary, PracticeSetSummary } from "@/lib/queries/practice";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { moveContent } from "./actions";

export type ContentItem = PracticeSetSummary | ActivitySummary;

const ICON = {
  practice_set: Layers,
  video: PlayCircle,
  reading: BookOpen,
  link: Link2,
  guided_notes: FileText,
  worksheet: FileText,
} as const;

/** One list per course: practice sets and activities in the teacher's sequence, with move buttons. */
export function ContentList({ items }: { items: ContentItem[] }) {
  const { run, pending, error } = useAction();
  return (
    <div className="rounded-lg border border-border bg-card">
      {error ? (
        <p
          role="alert"
          className="m-3 rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
        >
          {error}
        </p>
      ) : null}
      <ol className="divide-y divide-border" aria-label="Practice content">
        {items.map((item, i) => {
          const isSet = item.kind === "practice_set";
          const Icon = ICON[isSet ? "practice_set" : item.activityKind];
          const href = isSet
            ? `/app/practice/sets/${item.id}`
            : `/app/practice/activities/${item.id}`;
          const ref = {
            type: isSet ? ("practice_set" as const) : ("relearning_activity" as const),
            id: item.id,
          };
          return (
            <li
              key={`${item.kind}:${item.id}`}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              data-content={item.id}
            >
              <Icon className="size-5 shrink-0 text-brand-deep" aria-hidden />
              <div className="mr-auto min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={href} className="font-medium hover:underline">
                    {item.title}
                  </Link>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {isSet ? "Practice set" : KIND_LABEL[item.activityKind]}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      item.isPublished
                        ? "bg-success-soft text-success-foreground"
                        : "bg-warning-soft text-warning-foreground"
                    }`}
                  >
                    {item.isPublished ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground tabular">
                  {item.targets.length === 0 ? (
                    <span className="text-warning-foreground">No target yet</span>
                  ) : (
                    item.targets.map((t) => (
                      <TargetChip key={t.id} code={t.code} title={t.title} className="h-5" />
                    ))
                  )}
                  {isSet ? (
                    <span>
                      · {item.questions} {item.questions === 1 ? "question" : "questions"}
                      {item.source === "pool" ? " from a pool" : ""}
                    </span>
                  ) : null}
                  <span>
                    · {item.completions} {item.completions === 1 ? "student" : "students"} done
                  </span>
                  {!isSet && item.pendingVerification > 0 ? (
                    <span className="text-warning-foreground">
                      · {item.pendingVerification} to verify
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="inline-flex items-center gap-0.5">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Move up"
                  disabled={pending || i === 0}
                  onClick={() => run(moveContent(ref, "up"))}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Move down"
                  disabled={pending || i === items.length - 1}
                  onClick={() => run(moveContent(ref, "down"))}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={href} />}
                >
                  Edit
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
