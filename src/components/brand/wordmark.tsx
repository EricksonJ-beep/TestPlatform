import { cn } from "cn";

/** The Bloom wordmark: a coral bloom mark plus the name in Lexend. */
export function Wordmark({
  className,
  tone = "brand",
  size = "md",
}: {
  className?: string;
  /** "brand" = teal text on light; "inverse" = white text on teal. */
  tone?: "brand" | "inverse";
  size?: "sm" | "md" | "lg";
}) {
  const text = { sm: "text-lg", md: "text-xl", lg: "text-2xl" }[size];
  const mark = { sm: "size-5", md: "size-6", lg: "size-7" }[size];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-heading font-semibold tracking-tight",
        tone === "inverse" ? "text-white" : "text-brand",
        text,
        className
      )}
    >
      <span aria-hidden className={cn("inline-block rounded-md bg-coral", mark)} />
      Bloom
    </span>
  );
}
