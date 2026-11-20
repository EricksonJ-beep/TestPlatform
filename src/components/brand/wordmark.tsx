import { cn } from "cn";

/** The Bloom mark: a violet disc, a white ring and a pink center dot. */
export function BloomMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <circle cx="14" cy="14" r="13" fill="#4A35C8" />
      <circle cx="14" cy="14" r="7.5" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="14" cy="14" r="2.8" fill="#FF7AA8" />
    </svg>
  );
}

/** The Bloom wordmark: the mark, then the name in Bricolage Grotesque 700. */
export function Wordmark({
  className,
  tone = "brand",
  size = "md",
}: {
  className?: string;
  /** "brand" = ink text on light; "inverse" = white text on a dark background. */
  tone?: "brand" | "inverse";
  size?: "sm" | "md" | "lg";
}) {
  const text = { sm: "text-lg", md: "text-2xl", lg: "text-[28px]" }[size];
  const mark = { sm: 22, md: 28, lg: 32 }[size];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display leading-none font-bold tracking-tight",
        tone === "inverse" ? "text-white" : "text-ink",
        text,
        className
      )}
    >
      <BloomMark size={mark} />
      Bloom
    </span>
  );
}
