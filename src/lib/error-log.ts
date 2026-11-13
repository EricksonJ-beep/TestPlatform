/**
 * One searchable line per server error (hardening plan H7.2, Nov 9 2026).
 *
 * Until now a server error reached nobody: the student saw "Something went wrong" with a
 * reference number, and the reason sat in the function's output with nothing to find it by.
 * Each error is now logged as one JSON line that starts with `[bloom-error]` and carries the
 * same reference (digest) the error page shows, so "Reference 1234…" from a student can be
 * pasted into Vercel's log search.
 *
 * No names, emails, answers or cookies: the path (without its query), the route file, the kind
 * of request, and the error.
 */
export type RequestErrorInfo = {
  path: string;
  method: string;
};
export type RequestErrorContext = {
  routePath?: string;
  routeType?: string;
};

export function errorLogLine(
  err: unknown,
  request: RequestErrorInfo,
  context: RequestErrorContext,
  now = new Date()
): string {
  const e = err as { message?: unknown; digest?: unknown; name?: unknown; stack?: unknown } | null;
  const message = err instanceof Error ? err.message : String(e?.message ?? err);
  const stack = typeof e?.stack === "string" ? e.stack.split("\n").slice(1, 6) : [];
  return (
    "[bloom-error] " +
    JSON.stringify({
      at: now.toISOString(),
      digest: typeof e?.digest === "string" ? e.digest : null,
      name: typeof e?.name === "string" ? e.name : "Error",
      message: message.slice(0, 500),
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath ?? null,
      kind: context.routeType ?? null,
      stack: stack.map((l) => l.trim()),
    })
  );
}
