"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Download, Info, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseCsvRecords } from "@/lib/csv";
import { CSV_COLUMNS, missingHeaders, type RawRecord } from "@/lib/import/question-csv";
import type { ImportPlan, ImportResult } from "@/lib/import/question-import";
import { TYPE_LABEL } from "@/lib/question-types";
import type { QuestionType } from "@/db/types";
import { commitQuestionImport, previewQuestionImport } from "../../actions";

type Step =
  | { name: "upload" }
  | { name: "preview"; plan: ImportPlan }
  | { name: "done"; result: ImportResult };

export function ImportWizard({
  bankId,
  bankName,
  courseName,
}: {
  bankId: string;
  bankName: string;
  courseName: string | null;
}) {
  const [step, setStep] = useState<Step>({ name: "upload" });
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<RawRecord[]>([]);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const preview = (h: string[], r: RawRecord[]) => {
    start(async () => {
      const res = await previewQuestionImport(bankId, h, r);
      if (res.ok) {
        setError(null);
        setStep({ name: "preview", plan: res.data });
      } else setError(res.error);
    });
  };

  async function onFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsvRecords(text);
    const missing = missingHeaders(parsed.headers);
    if (missing.length) {
      setError(
        `The CSV is missing required column(s): ${missing.join(", ")}. Found: ${parsed.headers.join(", ") || "none"}.`
      );
      return;
    }
    if (parsed.records.length === 0) {
      setError("That file has a header row but no questions.");
      return;
    }
    setHeaders(parsed.headers);
    setRecords(parsed.records);
    setSkipped(new Set());
    preview(parsed.headers, parsed.records);
  }

  function saveEdit(line: number, patch: RawRecord) {
    const next = records.map((r, i) => (i + 2 === line ? { ...r, ...patch } : r));
    setRecords(next);
    setEditingLine(null);
    preview(headers, next);
  }

  function confirm() {
    start(async () => {
      const res = await commitQuestionImport(bankId, headers, records, [...skipped]);
      if (res.ok) {
        setError(null);
        setStep({ name: "done", result: res.data });
      } else setError(res.error);
    });
  }

  const summary = useMemo(() => {
    if (step.name !== "preview") return null;
    const rows = step.plan.rows;
    const willInsert = rows.filter((r) => r.action === "insert" && !skipped.has(r.line)).length;
    const willUpdate = rows.filter((r) => r.action === "update" && !skipped.has(r.line)).length;
    const willSkip = rows.length - willInsert - willUpdate;
    return { willInsert, willUpdate, willSkip };
  }, [step, skipped]);

  if (!courseName) {
    return (
      <div className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
        This bank has no course yet. Set one from the bank page (Rename → Course) so imported
        targets and pools have a home.
      </div>
    );
  }

  if (step.name === "done") {
    const { result } = step;
    const problems = result.rows.filter(
      (r) => r.action === "skipped" && r.error && r.error !== "Skipped by you."
    );
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-6 text-success" aria-hidden />
          <h2 className="text-lg">Import finished</h2>
        </div>
        <p className="text-sm">
          <b className="tabular">{result.counts.inserted}</b> inserted ·{" "}
          <b className="tabular">{result.counts.updated}</b> updated ·{" "}
          <b className="tabular">{result.counts.skipped}</b> skipped.
          {result.created.targets +
            result.created.pools +
            result.created.units +
            result.created.stimuli +
            result.created.standards >
          0 ? (
            <>
              {" "}
              Created {result.created.targets} target(s), {result.created.pools} pool(s),{" "}
              {result.created.units} unit(s), {result.created.stimuli} stimul
              {result.created.stimuli === 1 ? "us" : "i"}, {result.created.standards} standard(s).
            </>
          ) : null}
        </p>
        {problems.length ? (
          <div className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground">
            <p className="font-medium">Rows that could not be written:</p>
            <ul className="mt-1 list-disc pl-5">
              {problems.map((p) => (
                <li key={p.line}>
                  Line {p.line}: {p.error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button nativeButton={false} render={<Link href={`/app/banks/${bankId}`} />}>
            Open {bankName}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setStep({ name: "upload" });
              setRecords([]);
              setFileName(null);
            }}
          >
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  if (step.name === "upload") {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
        <div className="grid gap-1.5">
          <Label htmlFor="csv">CSV file</Label>
          <Input
            id="csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            Rows must use course &quot;{courseName}&quot;. Learning targets and pools that
            don&apos;t exist yet are created by name.
          </p>
        </div>
        {pending ? <p className="text-sm text-muted-foreground">Checking {fileName}…</p> : null}
        {error ? (
          <p
            role="alert"
            className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <a
            href="/question_import_template.csv"
            download
            className="inline-flex items-center gap-1 font-medium text-brand-deep hover:underline"
          >
            <Download className="size-4" aria-hidden /> Download the template
          </a>
          <span>
            Required: course, learning_target, type, stem, correct (except matching and
            extended_response).
          </span>
        </div>
      </div>
    );
  }

  const { plan } = step;
  const editingRecord = editingLine !== null ? records[editingLine - 2] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <span className="font-medium">{fileName}</span>
        <span className="tabular">{plan.rows.length} rows</span>
        <span className="text-success-foreground tabular">{summary?.willInsert} to insert</span>
        <span className="text-brand-deep tabular">{summary?.willUpdate} to update</span>
        <span className="text-muted-foreground tabular">{summary?.willSkip} skipped</span>
        {plan.willCreate.targets.length || plan.willCreate.pools.length ? (
          <span className="text-muted-foreground">
            Will create {plan.willCreate.targets.length} target(s), {plan.willCreate.pools.length}{" "}
            pool(s)
            {plan.willCreate.units.length ? `, ${plan.willCreate.units.length} unit(s)` : ""}
            {plan.willCreate.stimuli.length
              ? `, ${plan.willCreate.stimuli.length} stimulus group(s)`
              : ""}
          </span>
        ) : null}
        <span className="ml-auto flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStep({ name: "upload" });
              setError(null);
            }}
          >
            Choose another file
          </Button>
          <Button
            size="sm"
            onClick={confirm}
            disabled={pending || (summary?.willInsert ?? 0) + (summary?.willUpdate ?? 0) === 0}
          >
            {pending
              ? "Importing…"
              : `Import ${(summary?.willInsert ?? 0) + (summary?.willUpdate ?? 0)} questions`}
          </Button>
        </span>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
        >
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Line</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Stem</th>
              <th className="px-3 py-2 font-medium">Target · pool</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              <th className="px-3 py-2 font-medium">Skip</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border align-top">
            {plan.rows.map((r) => {
              const isSkipped = r.action === "skip" || skipped.has(r.line);
              return (
                <tr key={r.line} className={isSkipped ? "opacity-60" : ""}>
                  <td className="px-3 py-2 text-muted-foreground tabular">{r.line}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={r.status} action={r.action} skipped={skipped.has(r.line)} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {TYPE_LABEL[r.type as QuestionType] ?? r.type}
                  </td>
                  <td className="max-w-md px-3 py-2">
                    <span className="line-clamp-2">{r.stem}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{r.learningTarget}</div>
                    {r.pool ? <div className="text-muted-foreground">{r.pool}</div> : null}
                  </td>
                  <td className="max-w-sm px-3 py-2 text-xs">
                    {r.issues.map((i, k) => (
                      <div
                        key={k}
                        className={
                          i.level === "error"
                            ? "text-error-foreground"
                            : i.level === "warning"
                              ? "text-warning-foreground"
                              : "text-muted-foreground"
                        }
                      >
                        {i.message}
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand"
                      aria-label={`Skip line ${r.line}`}
                      checked={isSkipped}
                      disabled={r.action === "skip"}
                      onChange={(e) => {
                        const next = new Set(skipped);
                        if (e.target.checked) next.add(r.line);
                        else next.delete(r.line);
                        setSkipped(next);
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button size="xs" variant="ghost" onClick={() => setEditingLine(r.line)}>
                      Fix
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={editingLine !== null} onOpenChange={(o) => !o && setEditingLine(null)}>
        <DialogContent className="sm:max-w-2xl">
          {editingRecord && editingLine !== null ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const patch: RawRecord = {};
                for (const col of CSV_COLUMNS) if (fd.has(col)) patch[col] = String(fd.get(col));
                saveEdit(editingLine, patch);
              }}
            >
              <DialogHeader>
                <DialogTitle>Fix line {editingLine}</DialogTitle>
                <DialogDescription>
                  Edit the row&apos;s cells; it is re-checked when you save.
                </DialogDescription>
              </DialogHeader>
              <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                {CSV_COLUMNS.filter((c) => headers.includes(c)).map((col) => (
                  <div
                    key={col}
                    className={
                      col === "stem" || col === "explanation" || col.startsWith("stimulus_text")
                        ? "grid gap-1 sm:col-span-2"
                        : "grid gap-1"
                    }
                  >
                    <Label htmlFor={`fix-${col}`} className="text-xs">
                      {col}
                    </Label>
                    <Input id={`fix-${col}`} name={col} defaultValue={editingRecord[col] ?? ""} />
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditingLine(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  Save and re-check
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({
  status,
  action,
  skipped,
}: {
  status: "ok" | "warning" | "error";
  action: "insert" | "update" | "skip";
  skipped: boolean;
}) {
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-error-soft px-2 py-0.5 text-xs font-medium text-error-foreground">
        <XCircle className="size-3" aria-hidden /> Error
      </span>
    );
  if (skipped)
    return (
      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Skipped
      </span>
    );
  if (status === "warning")
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-foreground">
        <AlertTriangle className="size-3" aria-hidden />{" "}
        {action === "update" ? "Update" : "Warning"}
      </span>
    );
  if (action === "update")
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-deep">
        <Info className="size-3" aria-hidden /> Update
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-success-soft px-2 py-0.5 text-xs font-medium text-success-foreground">
      <CheckCircle2 className="size-3" aria-hidden /> OK
    </span>
  );
}
