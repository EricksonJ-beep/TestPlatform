"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { RawRecord } from "@/lib/import/question-csv";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseDocumentImport } from "../../actions";

const ACCEPT =
  ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";
const MAX_MB = 10;

function toBase64(bytes: ArrayBuffer): string {
  let s = "";
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 0x8000)
    s += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * "Import from a Word or PDF test" (PLAN.md §3.5): the file goes to the
 * server, Claude drafts Appendix A rows, and they land in the same preview
 * as a CSV so every question is reviewed before it enters the bank.
 */
export function AiImportPanel({
  bankId,
  configured,
  disabled,
  onParsed,
}: {
  bankId: string;
  configured: boolean;
  disabled: boolean;
  onParsed: (
    headers: string[],
    records: RawRecord[],
    fileName: string,
    notes: string | null
  ) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | null) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`That file is over ${MAX_MB} MB. Split it or export a smaller PDF.`);
      return;
    }
    setBusy(`Reading ${file.name} with Claude… this takes about a minute for a long test.`);
    try {
      const base64 = toBase64(await file.arrayBuffer());
      const r = await parseDocumentImport(bankId, {
        fileName: file.name,
        contentType:
          file.type ||
          (file.name.endsWith(".docx")
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : file.name.endsWith(".pdf")
              ? "application/pdf"
              : "text/plain"),
        base64,
      });
      if (!r.ok) setError(r.error);
      else if (r.data.records.length === 0)
        setError(
          "No questions were found in that file." + (r.data.notes ? ` ${r.data.notes}` : "")
        );
      else onParsed(r.data.headers, r.data.records, file.name, r.data.notes);
    } catch {
      setError("Couldn't read that file.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="grid gap-1.5 rounded-lg border border-dashed border-brand/40 bg-brand-soft/30 p-4"
      data-ai-import
    >
      <Label htmlFor="ai-doc" className="flex items-center gap-1.5">
        <Sparkles className="size-4 text-brand-deep" aria-hidden />
        Or import a past test from Word or PDF
      </Label>
      <Input
        id="ai-doc"
        type="file"
        accept={ACCEPT}
        disabled={disabled || !configured || !!busy}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <p className="text-xs text-muted-foreground">
        {configured
          ? "Claude reads the test and its answer key and drafts one row per question. You review every row in the preview before anything is saved; fix a row inline or skip it. Up to 10 MB."
          : "Add ANTHROPIC_API_KEY to the server's environment to turn this on."}
      </p>
      {busy ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {busy}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
