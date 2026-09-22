"use client";

import { useRef, useState } from "react";
import { ImageIcon, Link2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MEDIA_RULES } from "@/lib/storage-rules";
import { imageSize, uploadFile } from "@/lib/upload-client";
import { ImageCropper } from "./image-cropper";

/**
 * Image or video field for the editor: upload (with crop for images) or paste a
 * URL. Submits the resolved URL through a hidden input named `name`.
 */
export function MediaField({
  name,
  label,
  kind,
  defaultUrl,
  storageConfigured,
}: {
  name: string;
  label: string;
  kind: "image" | "video";
  defaultUrl?: string | null;
  storageConfigured: boolean;
}) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [pasting, setPasting] = useState(!storageConfigured && !!defaultUrl);
  const [cropping, setCropping] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function send(blob: Blob, fileName: string) {
    setError(null);
    setProgress(0);
    let size: { width: number; height: number } | undefined;
    if (kind === "image") {
      try {
        size = await imageSize(blob);
      } catch {
        /* not fatal */
      }
    }
    const r = await uploadFile(blob, {
      fileName,
      kind,
      width: size?.width,
      height: size?.height,
      onProgress: setProgress,
    });
    setProgress(null);
    if (r.ok) setUrl(r.asset.url);
    else setError(r.error);
  }

  function onPick(file: File | null) {
    if (!file) return;
    if (kind === "image" && file.type !== "image/gif") setCropping(file);
    else void send(file, file.name);
  }

  const isYouTube = /youtube\.com|youtu\.be/.test(url);

  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <input type="hidden" name={name} value={url} />
      {url ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/50 p-2">
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-16 w-24 rounded object-cover" />
          ) : isYouTube ? (
            <span className="inline-flex h-16 w-24 items-center justify-center rounded bg-black/80 text-xs text-muted-foreground text-white">
              YouTube
            </span>
          ) : (
            <video src={url} className="h-16 w-24 rounded bg-black object-cover" muted />
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{url}</span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Remove"
            onClick={() => setUrl("")}
          >
            <X aria-hidden />
          </Button>
        </div>
      ) : cropping ? (
        <ImageCropper
          file={cropping}
          onCancel={() => setCropping(null)}
          onDone={(blob) => {
            const f = cropping;
            setCropping(null);
            void send(blob, f.name);
          }}
        />
      ) : progress !== null ? (
        <div className="grid gap-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-brand transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            Uploading… {Math.round(progress * 100)}%
          </span>
        </div>
      ) : pasting ? (
        <div className="flex gap-2">
          <Input
            type="url"
            placeholder={
              kind === "video" ? "https://youtu.be/… or a video URL" : "https://…/image.png"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setUrl((e.target as HTMLInputElement).value.trim());
                setPasting(false);
              }
            }}
            id={`${name}-paste`}
            autoFocus
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const el = document.getElementById(`${name}-paste`) as HTMLInputElement | null;
              if (el?.value.trim()) setUrl(el.value.trim());
              setPasting(false);
            }}
          >
            Use link
          </Button>
          <Button type="button" variant="ghost" onClick={() => setPasting(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={MEDIA_RULES[kind].mimes.join(",")}
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!storageConfigured}
            onClick={() => inputRef.current?.click()}
            title={storageConfigured ? undefined : "Add the R2_* variables to enable uploads"}
          >
            {kind === "image" ? (
              <ImageIcon data-icon="inline-start" aria-hidden />
            ) : (
              <Upload data-icon="inline-start" aria-hidden />
            )}
            Upload {kind}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPasting(true)}>
            <Link2 data-icon="inline-start" aria-hidden />
            {kind === "video" ? "YouTube or link" : "Paste a link"}
          </Button>
          <span className="text-xs text-muted-foreground">{MEDIA_RULES[kind].label}</span>
        </div>
      )}
      {error ? <p className="text-xs text-error-foreground">{error}</p> : null}
    </div>
  );
}
