/**
 * Ticket 1.4: the upload handshake and the media proxy, against an in-memory
 * S3-compatible stub (R2_ENDPOINT points at it), plus the access rules.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/session";

const state = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("@/lib/session", () => ({ getCurrentSession: async () => state.session }));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { startS3Stub, type S3Stub } from "@/test/s3-stub";
import { GET as mediaGet } from "@/app/api/media/[...key]/route";
import { completeUpload, requestUpload } from "./actions";

const ids = { teacher: "", other: "", student: "" };
let stub: S3Stub;
const asUser = (userId: string, role: Session["role"] = "teacher") => {
  state.session = { userId, role, email: `${userId}@x`, firstName: "T", lastName: "U" };
};

beforeAll(async () => {
  stub = await startS3Stub("bloom-test");
  process.env.R2_ACCOUNT_ID = "test";
  process.env.R2_ACCESS_KEY_ID = "key";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_BUCKET = "bloom-test";
  process.env.R2_ENDPOINT = stub.url;
  delete process.env.R2_PUBLIC_URL;
  const users = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "T", lastName: "T" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "O", lastName: "T" },
      { email: "s@t", passwordHash: "x", role: "student", firstName: "S", lastName: "T" },
    ])
    .returning();
  [ids.teacher, ids.other, ids.student] = users.map((u) => u.id);
});
afterAll(async () => {
  await stub.close();
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("upload handshake", () => {
  it("teacher gets a presigned PUT under their own namespace, uploads, and registers the asset", async () => {
    asUser(ids.teacher);
    const t = await requestUpload({
      fileName: "graph.png",
      contentType: "image/png",
      size: PNG.length,
      kind: "image",
    });
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.data.key.startsWith(`u/${ids.teacher}/`)).toBe(true);
    expect(t.data.uploadUrl.startsWith(stub.url)).toBe(true);
    expect(t.data.url).toBe(`/api/media/${t.data.key}`);

    const put = await fetch(t.data.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: PNG,
    });
    expect(put.ok).toBe(true);
    expect(stub.objects.has(t.data.key)).toBe(true);

    const done = await completeUpload({ key: t.data.key, width: 400, height: 300 });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.data.kind).toBe("image");
    const row = await db.query.mediaAssets.findFirst({
      where: eq(schema.mediaAssets.id, done.data.id),
    });
    expect(row).toMatchObject({
      ownerId: ids.teacher,
      storageKey: t.data.key,
      mimeType: "image/png",
      sizeBytes: PNG.length,
      width: 400,
      height: 300,
    });
  });

  it("rejects unsupported or oversized files before minting a URL", async () => {
    asUser(ids.teacher);
    await expect(
      requestUpload({ fileName: "x.pdf", contentType: "application/pdf", size: 10 })
    ).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(
      requestUpload({ fileName: "x.png", contentType: "image/png", size: 50 * 1024 * 1024 })
    ).resolves.toMatchObject({ ok: false, status: 400 });
  });

  it("students cannot upload; a teacher cannot register another teacher's key or a missing object", async () => {
    asUser(ids.student, "student");
    await expect(
      requestUpload({ fileName: "x.png", contentType: "image/png", size: 10 })
    ).resolves.toMatchObject({ ok: false, status: 403 });

    asUser(ids.teacher);
    const t = await requestUpload({
      fileName: "a.png",
      contentType: "image/png",
      size: PNG.length,
    });
    if (!t.ok) throw new Error("ticket");
    asUser(ids.other);
    await expect(completeUpload({ key: t.data.key })).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
    asUser(ids.teacher);
    await expect(completeUpload({ key: t.data.key })).resolves.toMatchObject({
      ok: false,
      status: 400,
    }); // never PUT
    await expect(completeUpload({ key: "u/../../etc" })).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("reports storage as unavailable when the R2 variables are missing", async () => {
    const saved = process.env.R2_BUCKET;
    delete process.env.R2_BUCKET;
    asUser(ids.teacher);
    await expect(
      requestUpload({ fileName: "x.png", contentType: "image/png", size: 10 })
    ).resolves.toMatchObject({ ok: false, status: 503 });
    process.env.R2_BUCKET = saved;
  });
});

describe("media proxy", () => {
  it("streams an object to any signed-in user with caching headers, 404s unknown keys, 401s anonymous", async () => {
    asUser(ids.teacher);
    const t = await requestUpload({
      fileName: "graph.png",
      contentType: "image/png",
      size: PNG.length,
    });
    if (!t.ok) throw new Error("ticket");
    await fetch(t.data.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: PNG,
    });
    const parts = t.data.key.split("/");

    asUser(ids.student, "student");
    const res = await mediaGet(new Request("http://x/api/media/" + t.data.key), {
      params: Promise.resolve({ key: parts }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toMatch(/private/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);

    const etag = res.headers.get("etag")!;
    const cached = await mediaGet(
      new Request("http://x/api/media/" + t.data.key, { headers: { "if-none-match": etag } }),
      { params: Promise.resolve({ key: parts }) }
    );
    expect(cached.status).toBe(304);

    const missing = await mediaGet(new Request("http://x/api/media/x"), {
      params: Promise.resolve({
        key: ["u", ids.teacher, "2026", "00000000-0000-0000-0000-000000000000.png"],
      }),
    });
    expect(missing.status).toBe(404);
    const bad = await mediaGet(new Request("http://x/api/media/x"), {
      params: Promise.resolve({ key: ["..", "etc", "passwd"] }),
    });
    expect(bad.status).toBe(404);

    state.session = null;
    const anon = await mediaGet(new Request("http://x/api/media/" + t.data.key), {
      params: Promise.resolve({ key: parts }),
    });
    expect(anon.status).toBe(401);
  });
});
