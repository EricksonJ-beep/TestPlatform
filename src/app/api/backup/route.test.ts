/** The backup endpoint's lock, and that what it sends can be read back (H7.3). */
import { gunzipSync } from "node:zlib";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});
vi.mock("@/lib/session", () => ({ getCurrentSession: async () => null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));

import { db, schema } from "@/db";
import { GET } from "./route";

const SECRET = "a-long-backup-secret-of-at-least-32-chars";
const call = (query = "", secret: string | null = SECRET) =>
  GET(
    new Request(`https://bloom.example/api/backup${query}`, {
      headers: secret ? { "x-bloom-backup-secret": secret } : {},
    }),
    undefined as never
  );

beforeAll(async () => {
  await db.insert(schema.users).values({
    email: "t@example.test",
    passwordHash: "hash",
    role: "teacher",
    firstName: "Tess",
    lastName: "Teacher",
  });
});

describe("GET /api/backup", () => {
  it("is off until a long secret is set", async () => {
    delete process.env.BLOOM_BACKUP_SECRET;
    expect((await call()).status).toBe(503);
    process.env.BLOOM_BACKUP_SECRET = "short";
    expect((await call("", "short")).status).toBe(503);
    process.env.BLOOM_BACKUP_SECRET = SECRET;
  });

  it("refuses a missing or wrong secret, and says nothing about the data", async () => {
    for (const bad of [null, "wrong", SECRET + "x"]) {
      const r = await call("", bad);
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ ok: false, error: "Not allowed." });
    }
  });

  it("gives the manifest, then each table as gzipped JSON lines", async () => {
    const manifest = await (await call()).json();
    expect(manifest.app).toBe("bloom");
    expect(manifest.tables.find((t: { name: string }) => t.name === "users").rows).toBe(1);

    const r = await call("?table=users");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/gzip");
    const text = gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8");
    const rows = text
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "t@example.test", role: "teacher" });
  });

  it("serves only real tables", async () => {
    expect((await call("?table=pg_shadow")).status).toBe(404);
    expect((await call('?table=users";drop table users;--')).status).toBe(404);
    expect((await call("?table=auth_throttle")).status).toBe(404);
  });

  it("stops answering an address that keeps guessing", async () => {
    for (let i = 0; i < 12; i++) await call("", "guess-" + i);
    // Even the right secret waits now.
    expect((await call()).status).toBe(429);
  });
});
