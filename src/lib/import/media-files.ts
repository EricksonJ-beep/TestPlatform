"use client";

import { unzipSync } from "fflate";
import type { RawRecord } from "@/lib/import/question-csv";
import { mimeFromName } from "@/lib/storage-rules";
import { uploadFile } from "@/lib/upload-client";

const MEDIA_COLUMNS = [
  "image_url",
  "video_url",
  "stimulus_image_url",
  "stimulus_video_url",
] as const;
const ABSOLUTE = /^(https?:\/\/|\/api\/media\/)/i;

/** File names the CSV references that are not already URLs. */
export function referencedFileNames(records: RawRecord[]): string[] {
  const names = new Set<string>();
  for (const r of records) {
    for (const col of MEDIA_COLUMNS) {
      const v = (r[col] ?? "").trim();
      if (v && !ABSOLUTE.test(v)) names.add(v);
    }
  }
  return [...names];
}

/** Expands a zip (or passes files through) into name → File, matching on the base name. */
export async function collectFiles(inputs: File[]): Promise<Map<string, File>> {
  const out = new Map<string, File>();
  for (const f of inputs) {
    if (
      /\.zip$/i.test(f.name) ||
      f.type === "application/zip" ||
      f.type === "application/x-zip-compressed"
    ) {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()));
      for (const [path, bytes] of Object.entries(entries)) {
        if (
          path.endsWith("/") ||
          bytes.length === 0 ||
          /(^|\/)__MACOSX\//.test(path) ||
          /(^|\/)\./.test(path)
        )
          continue;
        const base = path.split("/").pop()!;
        const mime = mimeFromName(base);
        if (!mime) continue;
        out.set(base.toLowerCase(), new File([bytes as BlobPart], base, { type: mime }));
      }
    } else {
      const mime = f.type || mimeFromName(f.name);
      if (!mime) continue;
      out.set(f.name.toLowerCase(), f.type ? f : new File([f], f.name, { type: mime }));
    }
  }
  return out;
}

export type MediaUploadReport = {
  uploaded: Record<string, string>;
  missing: string[];
  failed: Record<string, string>;
};

/**
 * Uploads every referenced file that was provided and rewrites the records'
 * media cells to the resulting URLs. Rows referencing files not provided are
 * left as-is (the parser flags them).
 */
export async function uploadReferencedMedia(
  records: RawRecord[],
  files: Map<string, File>,
  onProgress?: (done: number, total: number) => void
): Promise<{ records: RawRecord[]; report: MediaUploadReport }> {
  const names = referencedFileNames(records);
  const report: MediaUploadReport = { uploaded: {}, missing: [], failed: {} };
  let done = 0;
  for (const name of names) {
    const base = name.split("/").pop()!.toLowerCase();
    const file = files.get(base) ?? files.get(name.toLowerCase());
    if (!file) {
      report.missing.push(name);
      continue;
    }
    const r = await uploadFile(file, { fileName: file.name });
    if (r.ok) report.uploaded[name] = r.asset.url;
    else report.failed[name] = r.error;
    onProgress?.(++done, names.length);
  }
  const rewritten = records.map((r) => {
    const copy = { ...r };
    for (const col of MEDIA_COLUMNS) {
      const v = (copy[col] ?? "").trim();
      if (v && report.uploaded[v]) copy[col] = report.uploaded[v];
    }
    return copy;
  });
  return { records: rewritten, report };
}
