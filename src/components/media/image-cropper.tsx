"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Drag a rectangle over the image to crop it. Renders on a canvas scaled to fit;
 * the crop is applied at the image's natural resolution and returned as a JPEG/PNG blob.
 */
export function ImageCropper({
  file,
  onDone,
  onCancel,
}: {
  file: File;
  onDone: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [rect, setRect] = useState<Rect | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState(0); // bumps when a new image is ready so the canvas redraws even if the scale is unchanged

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const maxW = 720;
      const s = Math.min(1, maxW / img.naturalWidth);
      setScale(s);
      setRect(null);
      setLoaded((n) => n + 1);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (rect) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        img,
        rect.x / scale,
        rect.y / scale,
        rect.w / scale,
        rect.h / scale,
        rect.x,
        rect.y,
        rect.w,
        rect.h
      );
      ctx.strokeStyle = "#FF6B5C";
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
    }
  }, [scale, rect, loaded]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const sx = e.currentTarget.width / r.width;
    const sy = e.currentTarget.height / r.height;
    return {
      x: Math.max(0, Math.min(e.currentTarget.width, (e.clientX - r.left) * sx)),
      y: Math.max(0, Math.min(e.currentTarget.height, (e.clientY - r.top) * sy)),
    };
  }

  async function apply() {
    const img = imgRef.current;
    if (!img) return;
    const r =
      rect && rect.w > 8 && rect.h > 8
        ? rect
        : { x: 0, y: 0, w: img.naturalWidth * scale, h: img.naturalHeight * scale };
    const out = document.createElement("canvas");
    out.width = Math.round(r.w / scale);
    out.height = Math.round(r.h / scale);
    out
      .getContext("2d")!
      .drawImage(
        img,
        r.x / scale,
        r.y / scale,
        r.w / scale,
        r.h / scale,
        0,
        0,
        out.width,
        out.height
      );
    const type =
      file.type === "image/png" || file.type === "image/gif" ? "image/png" : "image/jpeg";
    out.toBlob((b) => b && onDone(b), type, 0.92);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Drag to choose the part of the image to keep, or apply without dragging to keep it all.
      </p>
      <canvas
        ref={canvasRef}
        className="max-w-full cursor-crosshair touch-none rounded-md border"
        onPointerDown={(e) => {
          const p = pos(e);
          dragRef.current = p;
          setRect({ x: p.x, y: p.y, w: 0, h: 0 });
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* synthetic or already-captured pointer */
          }
        }}
        onPointerMove={(e) => {
          const start = dragRef.current;
          if (!start) return;
          const p = pos(e);
          setRect({
            x: Math.min(start.x, p.x),
            y: Math.min(start.y, p.y),
            w: Math.abs(p.x - start.x),
            h: Math.abs(p.y - start.y),
          });
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      />
      <div className="flex gap-2">
        <Button type="button" onClick={apply}>
          {rect && rect.w > 8 ? "Apply crop and upload" : "Upload whole image"}
        </Button>
        {rect && rect.w > 8 ? (
          <Button type="button" variant="ghost" onClick={() => setRect(null)}>
            Clear selection
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
