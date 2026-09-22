"use client";

import { useEffect, useState } from "react";
import { Layers, Search } from "lucide-react";
import { TYPE_LABEL } from "@/lib/question-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichText } from "@/components/rich-text";
import { TargetChip } from "@/components/targets/target-chip";
import { useAction } from "@/components/use-action";
import { addPoolDraw, addQuestions, searchBankQuestions, type PickerQuestion } from "../actions";

export type BuilderPool = {
  id: string;
  name: string;
  size: number;
  drawStimulusGroups: boolean;
  targets: { id: string; code: string; title: string }[];
};

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The left pane of the builder (PLAN.md §3.4): a bank with filters to pick fixed
 * questions from, and the course's pools to add "draw N" instructions from.
 */
export function BankPane({
  assessmentId,
  banks,
  pools,
  targets,
  sections,
}: {
  assessmentId: string;
  banks: { id: string; name: string }[];
  pools: BuilderPool[];
  targets: { id: string; code: string; title: string }[];
  sections: { id: string; title: string }[];
}) {
  const [bankId, setBankId] = useState(banks[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [targetId, setTargetId] = useState("");
  const [rows, setRows] = useState<PickerQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [poolId, setPoolId] = useState(pools[0]?.id ?? "");
  const [drawCount, setDrawCount] = useState(5);
  const { run, pending, error } = useAction();

  // Keep the target section valid as sections come and go.
  const sectionValid = sections.some((s) => s.id === sectionId);
  const activeSection = sectionValid ? sectionId : (sections[0]?.id ?? "");

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!bankId) {
        setRows([]);
        return;
      }
      const r = await searchBankQuestions(assessmentId, bankId, {
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
  }, [assessmentId, bankId, q, targetId]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pool = pools.find((p) => p.id === poolId);

  return (
    <div className="flex flex-col gap-3 lg:sticky lg:top-4">
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
                          {r.stimulusTitle ? <span>· {r.stimulusTitle}</span> : null}
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
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-40 flex-1 gap-1.5">
                <Label htmlFor="bp-section">Add to section</Label>
                <select
                  id="bp-section"
                  value={activeSection}
                  onChange={(e) => setSectionId(e.target.value)}
                  className={selectClass}
                  disabled={sections.length === 0}
                >
                  {sections.length === 0 ? <option value="">Add a section first</option> : null}
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                disabled={pending || selected.size === 0 || !activeSection}
                onClick={() =>
                  run(addQuestions(assessmentId, activeSection, [...selected]), () =>
                    setSelected(new Set())
                  )
                }
              >
                Add {selected.size > 0 ? selected.size : ""}{" "}
                {selected.size === 1 ? "question" : "questions"}
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-medium">Draw from a pool</h2>
        </div>
        {pools.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pools on this course. Pools live on the course page and are tagged to a target.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid min-w-40 flex-1 gap-1.5">
              <Label htmlFor="bp-pool">Pool</Label>
              <select
                id="bp-pool"
                value={poolId}
                onChange={(e) => setPoolId(e.target.value)}
                className={selectClass}
              >
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.size})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid w-20 gap-1.5">
              <Label htmlFor="bp-count">Draw</Label>
              <Input
                id="bp-count"
                type="number"
                min={1}
                max={100}
                value={drawCount}
                onChange={(e) => setDrawCount(Number(e.target.value))}
              />
            </div>
            <Button
              variant="secondary"
              disabled={pending || !activeSection || !poolId}
              onClick={() => run(addPoolDraw(assessmentId, activeSection, poolId, drawCount))}
            >
              Add draw
            </Button>
            {pool ? (
              <p className="basis-full text-xs text-muted-foreground">
                {pool.size} live {pool.size === 1 ? "question" : "questions"}
                {pool.targets.length ? ` · ${pool.targets.map((t) => t.code).join(", ")}` : ""}
                {pool.drawStimulusGroups ? " · draws whole stimulus groups" : ""}
                {drawCount > pool.size ? ` · only ${pool.size} can be served` : ""}
              </p>
            ) : null}
          </div>
        )}
      </section>
      {error ? <p className="text-sm text-error-foreground">{error}</p> : null}
    </div>
  );
}
