"use client";

import { cn } from "cn";
import { RichText } from "@/components/rich-text";
import type { StimulusInfo } from "@/lib/stimulus-groups";

function youTubeEmbed(url: string): string | null {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/
  );
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

/**
 * The shared stimulus rendered once above its question group: a passage, image,
 * video, or audio clip in the soft panel from PLAN.md §5. `pinned` keeps it
 * visible while paging through questions one at a time.
 */
export function StimulusPanel({
  stimulus,
  count,
  pinned = false,
  className,
}: {
  stimulus: StimulusInfo;
  count?: number;
  pinned?: boolean;
  className?: string;
}) {
  const embed =
    stimulus.mediaUrl && stimulus.kind === "video" ? youTubeEmbed(stimulus.mediaUrl) : null;
  return (
    <figure
      className={cn(
        "text-brand-ink rounded-lg bg-brand-soft px-4 py-3",
        pinned && "sticky top-14 z-[5] shadow-sm",
        className
      )}
    >
      <figcaption className="mb-2 flex items-baseline gap-2 text-xs font-medium tracking-wide text-brand-deep uppercase">
        <span>{stimulus.title || "Shared stimulus"}</span>
        {count ? (
          <span className="font-normal normal-case opacity-80">
            · {count} question{count === 1 ? "" : "s"}
          </span>
        ) : null}
      </figcaption>
      {stimulus.kind === "text" && stimulus.content ? (
        <RichText
          text={stimulus.content}
          as="div"
          className="max-w-prose text-[15px] leading-relaxed"
        />
      ) : null}
      {stimulus.kind === "image" && stimulus.mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stimulus.mediaUrl}
          alt={stimulus.title ?? ""}
          className="max-h-96 max-w-full rounded-md bg-white"
        />
      ) : null}
      {stimulus.kind === "video" && stimulus.mediaUrl ? (
        embed ? (
          <iframe
            src={embed}
            title={stimulus.title ?? "Video"}
            className="aspect-video w-full max-w-2xl rounded-md"
            allow="accelerometer; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            src={stimulus.mediaUrl}
            controls
            className="w-full max-w-2xl rounded-md bg-black"
          />
        )
      ) : null}
      {stimulus.kind === "audio" && stimulus.mediaUrl ? (
        <audio src={stimulus.mediaUrl} controls className="w-full max-w-md" />
      ) : null}
      {stimulus.kind !== "text" && stimulus.content ? (
        <RichText text={stimulus.content} as="p" className="mt-2 max-w-prose text-sm" />
      ) : null}
    </figure>
  );
}
