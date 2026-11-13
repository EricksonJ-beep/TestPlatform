import { requireSession, withAuthzRoute } from "@/lib/authz";
import { getObjectStream, isStorageConfigured, isValidKey } from "@/lib/storage";
import { kindForMime } from "@/lib/storage-rules";

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

  // Only pictures, video and audio are shown in the page (H4.6, Nov 9 2026). Anything else in
  // the bucket downloads as a plain file, and nothing served here can run script on this site.
  const showable = kindForMime(obj.contentType.split(";")[0].trim().toLowerCase()) !== null;
  const headers = new Headers({
    "Content-Type": showable ? obj.contentType : "application/octet-stream",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  if (!showable) headers.set("Content-Disposition", "attachment");
  if (obj.contentLength !== null) headers.set("Content-Length", String(obj.contentLength));
  if (obj.etag) headers.set("ETag", obj.etag);
  return new Response(obj.body, { status: 200, headers });
});
