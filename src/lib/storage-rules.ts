/** Client-safe media rules (no SDK imports). Mirrors src/lib/storage.ts. */
export type MediaKind = "image" | "video" | "audio";

export const MEDIA_RULES: Record<MediaKind, { mimes: string[]; maxBytes: number; label: string }> =
  {
    image: {
      mimes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
      maxBytes: 10 * 1024 * 1024,
      label: "JPEG, PNG, GIF, or WebP up to 10 MB",
    },
    video: {
      mimes: ["video/mp4", "video/webm"],
      maxBytes: 200 * 1024 * 1024,
      label: "MP4 or WebM up to 200 MB",
    },
    audio: {
      mimes: ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/webm"],
      maxBytes: 30 * 1024 * 1024,
      label: "MP3, M4A, WAV, or WebM audio up to 30 MB",
    },
  };

export function kindForMime(mime: string): MediaKind | null {
  for (const [kind, rule] of Object.entries(MEDIA_RULES) as [
    MediaKind,
    (typeof MEDIA_RULES)[MediaKind],
  ][]) {
    if (rule.mimes.includes(mime)) return kind;
  }
  return null;
}

/** Guess a MIME type from a file name (zip entries carry none). */
export function mimeFromName(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
  };
  return map[ext] ?? null;
}
