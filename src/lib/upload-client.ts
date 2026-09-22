"use client";

import { completeUpload, requestUpload, type MediaAssetSummary } from "@/app/app/media/actions";

export type UploadProgress = (fraction: number) => void;

/** Browser side of an upload: ask for a ticket, PUT the bytes with progress, then register the asset. */
export async function uploadFile(
  file: Blob,
  opts: {
    fileName: string;
    kind?: "image" | "video" | "audio";
    altText?: string;
    width?: number;
    height?: number;
    onProgress?: UploadProgress;
  }
): Promise<{ ok: true; asset: MediaAssetSummary } | { ok: false; error: string }> {
  const contentType = file.type || "application/octet-stream";
  const ticket = await requestUpload({
    fileName: opts.fileName,
    contentType,
    size: file.size,
    kind: opts.kind,
  });
  if (!ticket.ok) return { ok: false, error: ticket.error };

  const put = await new Promise<{ ok: boolean; status: number }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.data.uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
    xhr.onerror = () => resolve({ ok: false, status: 0 });
    xhr.send(file);
  });
  if (!put.ok)
    return {
      ok: false,
      error:
        put.status === 0
          ? "Upload failed (network or CORS). Check the bucket's CORS rule allows PUT from this site."
          : `Upload failed (${put.status}).`,
    };

  const done = await completeUpload({
    key: ticket.data.key,
    altText: opts.altText ?? null,
    width: opts.width ?? null,
    height: opts.height ?? null,
  });
  if (!done.ok) return { ok: false, error: done.error };
  return { ok: true, asset: done.data };
}

/** Reads an image's natural size in the browser. */
export function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}
