"use client";

import { useState } from "react";
import { Download, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The files of a Skyward export with names the teacher can edit before downloading (K1): each one
 * on its own, or all of them in one .zip. The buttons post (`POST /api/results/…/skyward`), so
 * Bloom remembers what it handed over and Skyward updates can list what changes after.
 */
export function SkywardFiles({
  assignmentId,
  files,
}: {
  assignmentId: string;
  files: { name: string; label: string; rows: number }[];
}) {
  const [names, setNames] = useState(files.map((f) => f.name));
  const base = `/api/results/${assignmentId}/skyward`;
  const hidden = (file: number | null) => (
    <>
      {file === null ? null : <input type="hidden" name="file" value={String(file)} />}
      {names.map((n, j) => (
        <input key={j} type="hidden" name="n" value={n} />
      ))}
    </>
  );
  return (
    <section className="flex flex-col gap-3" aria-label="Skyward files">
      <ul className="flex flex-col gap-2">
        {files.map((f, i) => (
          <li
            key={f.label}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
            data-skyward-file={f.label}
          >
            <span className="w-24 text-sm font-medium">{f.label}</span>
            <label className="flex min-w-0 flex-1 items-center gap-1 text-sm">
              <span className="sr-only">File name for {f.label}</span>
              <input
                value={names[i]}
                onChange={(e) =>
                  setNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))
                }
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-sm"
              />
              <span className="text-muted-foreground">.csv</span>
            </label>
            <span className="text-xs text-muted-foreground tabular">
              {f.rows} {f.rows === 1 ? "student" : "students"}
            </span>
            <form method="post" action={base}>
              {hidden(i)}
              <Button type="submit" variant="outline" size="sm">
                <Download data-icon="inline-start" aria-hidden />
                Download
              </Button>
            </form>
          </li>
        ))}
      </ul>
      {files.length > 1 ? (
        <form method="post" action={base}>
          {hidden(null)}
          <Button type="submit">
            <FileArchive data-icon="inline-start" aria-hidden />
            Download all ({files.length} files, .zip)
          </Button>
        </form>
      ) : null}
    </section>
  );
}
