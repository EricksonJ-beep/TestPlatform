import { requireSession, withAuthzRoute } from "@/lib/authz";
import { getObjectStream, isStorageConfigured, isValidKey } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Streams a stored file to any signed-in user (teacher or student). Bucket
 * credentials stay on the server; keys are opaque UUIDs so URLs aren't guessable.
 */
export const GET = withAuthzRoute<{ params: Promise<{ key: string[] }> }>(async (req, ctx) => {
  await requireSession();
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (!isValidKey(key)) return new Response("Not found", { status: 404 });
  if (!isStorageConfigured())
    return new Response("Media storage is not configured", { status: 503 });

  const obj = await getObjectStream(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const ifNoneMatch = req.headers.get("if-none-match");
  if (obj.etag && ifNoneMatch === obj.etag) return new Response(null, { status: 304 });

  const headers = new Headers({
    "Content-Type": obj.contentType,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  if (obj.contentLength !== null) headers.set("Content-Length", String(obj.contentLength));
  if (obj.etag) headers.set("ETag", obj.etag);
  return new Response(obj.body, { status: 200, headers });
});
