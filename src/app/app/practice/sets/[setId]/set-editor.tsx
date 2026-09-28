"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Search, Trash2, X } from "lucide-react";
import { TYPE_LABEL } from "@/lib/question-types";
import type { PracticeSetDetail } from "@/lib/queries/practice";
import { RichText } from "@/components/rich-text";
import { TargetPicker } from "@/components/targets/target-picker";
import { TargetChip } from "@/components/targets/target-chip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, useAction } from "@/components/use-action";
import {
  addPracticeQuestions,
  deletePracticeSet,
  movePracticeQuestion,
  removePracticeQuestion,
  searchQuestionsForSet,
  setPracticeSetPublished,
  updatePracticeSet,
  type PickerQuestion,
} from "../../actions";

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Target = { id: string; code: string; title: string };

/** Build a practice set: settings and targets on the left, its questions (or pool draw) on the right. */
export function SetEditor({
  detail,
  targets,
  pools,
  banks,
}: {
  detail: PracticeSetDetail;
  targets: Target[];
  pools: { id: string; name: string; size: number }[];
  banks: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [source, setSource] = useState<"fixed" | "pool">(detail.pool ? "pool" : "fixed");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useAction();
  const publish = useAction();
  const list = useAction();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl">{detail.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {detail.courseName ?? "No course"} · {detail.isPublished ? "Published" : "Draft"} ·{" "}
            {detail.stats.students} {detail.stats.students === 1 ? "student" : "students"} ·{" "}
            {detail.stats.completed} completed
            {detail.stats.averageBest !== null
              ? ` · average best ${Math.round(detail.stats.averageBest)}%`
              : ""}
          </p>
        </div>
        <Button
          variant={detail.isPublished ? "outline" : "default"}
          disabled={publish.pending}
          onClick={() => publish.run(setPracticeSetPublished(detail.id, !detail.isPublished))}
        >
          {detail.isPublished ? "Unpublish" : "Publish"}
        </Button>
        {confirmDelete ? (
          <>
            <Button
              variant="destructive"
              disabled={publish.pending}
              onClick={() =>
                publish.run(deletePracticeSet(detail.id), () => router.push("/app/practice"))
              }
            >
              Delete for good
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Delete practice set"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
      {publish.error ? (
        <p
          role="alert"
          className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
        >
          {publish.error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <form
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 lg:sticky lg:top-4 lg:self-start"
          onSubmit={(e) => {
            e.preventDefault();
            save.run(updatePracticeSet(detail.id, new FormData(e.currentTarget)));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="ps-title">Title</Label>
            <Input id="ps-title" name="title" defaultValue={detail.title} required />
            <FieldError errors={save.fieldErrors} name="title" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ps-desc">Description for students (optional)</Label>
            <Textarea
              id="ps-desc"
              name="description"
              rows={2}
              defaultValue={detail.description ?? ""}
              placeholder="What this practice covers and why it helps."
            />
          </div>
          <TargetPicker
            targets={targets}
            defaultSelected={detail.targets.map((t) => t.id)}
            label="Learning targets (the gate this set satisfies)"
          />
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Questions come from</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="source"
                value="fixed"
                checked={source === "fixed"}
                onChange={() => setSource("fixed")}
                className="accent-brand"
              />
              Fixed questions I pick (same set every time)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="source"
                value="pool"
                checked={source === "pool"}
                onChange={() => setSource("pool")}
                className="accent-brand"
                disabled={pools.length === 0}
              />
              A pool draw (new questions each attempt)
            </label>
            {source === "pool" ? (
              <div className="ml-6 flex flex-wrap items-end gap-2">
                <div className="grid min-w-40 flex-1 gap-1">
                  <Label htmlFor="ps-pool">Pool</Label>
                  <select
                    id="ps-pool"
                    name="poolId"
                    defaultValue={detail.pool?.id ?? pools[0]?.id ?? ""}
                    className={selectClass}
                  >
                    {pools.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.size})
                      </option>
                    ))}
                  </select>
                  <FieldError errors={save.fieldErrors} name="poolId" />
                </div>
                <div className="grid w-24 gap-1">
                  <Label htmlFor="ps-draw">Draw</Label>
                  <Input
                    id="ps-draw"
                    name="drawCount"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={detail.drawCount ?? 10}
                  />
                  <FieldError errors={save.fieldErrors} name="drawCount" />
                </div>
              </div>
            ) : null}
          </fieldset>
          {save.error ? <p className="text-sm text-error-foreground">{save.error}</p> : null}
          <Button type="submit" disabled={save.pending} className="self-start">
            Save
          </Button>
        </form>

        <div className="flex flex-col gap-3">
          {source === "pool" ? (
            <section className="rounded-lg border border-border bg-card p-4 text-sm">
              <h2 className="font-medium">Pool draw</h2>
              <p className="mt-1 text-muted-foreground">
                {detail.pool
                  ? `Each attempt draws ${detail.drawCount ?? detail.pool.size} of the ${detail.pool.size} live questions in “${detail.pool.name}”, preferring ones the student hasn't seen.`
                  : "Pick a pool and save; each attempt then draws fresh questions from it."}
              </p>
            </section>
          ) : (
            <>
              <section className="rounded-lg border border-border bg-card">
                <h2 className="border-b border-border px-4 py-2 text-sm font-medium tabular">
                  {detail.questions.length}{" "}
                  {detail.questions.length === 1 ? "question" : "questions"} in this set
                </h2>
                {list.error ? (
                  <p className="m-3 rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground">
                    {list.error}
                  </p>
                ) : null}
                {detail.questions.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-muted-foreground">
                    Pick questions from a bank below. Students get instant feedback with each
                    question&apos;s explanation, so add explanations to your questions.
                  </p>
                ) : (
                  <ol className="divide-y divide-border">
                    {detail.questions.map((q, i) => (
                      <li key={q.id} className="flex items-start gap-2 px-4 py-2 text-sm">
                        <span className="w-6 shrink-0 text-muted-foreground tabular">{i + 1}.</span>
                        <span className="min-w-0 flex-1">
                          <RichText text={q.stem} className="line-clamp-2" />
                          <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            <span>{TYPE_LABEL[q.type]}</span>
                            <span>· {q.points} pt</span>
                            {q.isArchived ? (
                              <span className="text-warning-foreground">· archived</span>
                            ) : null}
                            {q.targets.map((t) => (
                              <TargetChip
                                key={t.id}
                                code={t.code}
                                title={t.title}
                                className="h-5"
                              />
                            ))}
                          </span>
                        </span>
                        <span className="inline-flex shrink-0 items-center">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Move up"
                            disabled={list.pending || i === 0}
                            onClick={() => list.run(movePracticeQuestion(detail.id, q.id, "up"))}
                          >
                            <ArrowUp aria-hidden />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Move down"
                            disabled={list.pending || i === detail.questions.length - 1}
                            onClick={() => list.run(movePracticeQuestion(detail.id, q.id, "down"))}
                          >
                            <ArrowDown aria-hidden />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Remove"
                            disabled={list.pending}
                            onClick={() => list.run(removePracticeQuestion(detail.id, q.id))}
                          >
                            <X aria-hidden />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <QuestionPicker setId={detail.id} banks={banks} targets={targets} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionPicker({
  setId,
  banks,
  targets,
}: {
  setId: string;
  banks: { id: string; name: string }[];
  targets: Target[];
}) {
  const [bankId, setBankId] = useState(banks[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [targetId, setTargetId] = useState("");
  const [rows, setRows] = useState<PickerQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { run, pending, error } = useAction();

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!bankId) {
        setRows([]);
        return;
      }
      const r = await searchQuestionsForSet(setId, bankId, {
        q: q || undefined,
        targetId: targetId || undefined,
      });
      if (cancelled) return;
      if (r.ok) {
        setRows(r.data);
        setLoadError(null);
      } else setLoadError(r.error);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [setId, bankId, q, targetId]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-medium">Pick from a bank</h2>
      </div>
      {banks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No banks on this course yet. Create one under Question banks first.
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              aria-label="Bank"
              value={bankId}
              onChange={(e) => {
                setBankId(e.target.value);
                setSelected(new Set());
              }}
              className={selectClass}
            >
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by target"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className={selectClass}
            >
              <option value="">All targets</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.title}
                </option>
              ))}
            </select>
          </div>
          <Input
            aria-label="Search questions"
            placeholder="Search the stem…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
            {rows === null ? (
              <li className="px-3 py-4 text-sm text-muted-foreground">Loading…</li>
            ) : loadError ? (
              <li className="px-3 py-4 text-sm text-error-foreground">{loadError}</li>
            ) : rows.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground">No questions match.</li>
            ) : (
              rows.map((r) => (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggle(r.id)}
                      className="mt-0.5"
                      aria-label={`Select question: ${r.stem.slice(0, 40)}`}
                    />
                    <span className="min-w-0 flex-1">
                      <RichText text={r.stem} className="line-clamp-2" />
                      <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span>{TYPE_LABEL[r.type as keyof typeof TYPE_LABEL] ?? r.type}</span>
                        <span>· {r.points} pt</span>
                        {r.targets.map((t) => (
                          <TargetChip key={t.id} code={t.code} title={t.title} className="h-5" />
                        ))}
                      </span>
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
          <div className="flex items-center gap-2">
            <Button
              disabled={pending || selected.size === 0}
              onClick={() =>
                run(addPracticeQuestions(setId, [...selected]), () => setSelected(new Set()))
              }
            >
              Add {selected.size > 0 ? selected.size : ""}{" "}
              {selected.size === 1 ? "question" : "questions"}
            </Button>
            {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
          </div>
        </>
      )}
    </section>
  );
}
