/**
 * What a page shows while its data loads (hardening plan H6.5, Nov 9 2026). Before this a tap
 * on Start or Do corrections showed nothing until the server answered, which invited a second
 * tap. Grey bars in the page's shape, and a spoken "Loading" for screen readers.
 */
export function PageLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-56 rounded-md bg-muted motion-safe:animate-pulse" aria-hidden />
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-20 rounded-lg border border-border bg-card motion-safe:animate-pulse"
          aria-hidden
        />
      ))}
    </div>
  );
}
