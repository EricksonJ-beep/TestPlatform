/**
 * Ticket 1.18: change your own password. The current one must verify, the
 * new one meets the policy and matches its confirmation, and the temporary
 * password flag clears.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/session";

const state = vi.hoisted(() => ({ session: null as Session | null }));

vi.mock("@/lib/session", () => ({ getCurrentSession: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { changePassword, passwordStatus } from "./actions";

const ids = { student: "" };
function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}
const fails = async (p: Promise<{ ok: boolean; status?: number }>, status: number) =>
  expect(p).resolves.toMatchObject({ ok: false, status });

beforeAll(async () => {
  const [s] = await db
    .insert(schema.users)
    .values({
      username: "maya.rivera",
      passwordHash: await hashPassword("maple-7482"),
      role: "student",
      firstName: "Maya",
      lastName: "Rivera",
      mustChangePassword: true,
    })
    .returning();
  ids.student = s.id;
});

describe("changePassword", () => {
  it("needs a session, the right current password, a policy-length match", async () => {
    state.session = null;
    await fails(
      changePassword(fd({ current: "maple-7482", next: "sunflower-9", confirm: "sunflower-9" })),
      401
    );
    state.session = {
      userId: ids.student,
      role: "student",
      email: null,
      username: "maya.rivera",
      firstName: "Maya",
      lastName: "Rivera",
    };
    expect(await passwordStatus()).toMatchObject({ ok: true, data: { mustChange: true } });
    await fails(
      changePassword(fd({ current: "wrong", next: "sunflower-9", confirm: "sunflower-9" })),
      400
    );
    await fails(
      changePassword(fd({ current: "maple-7482", next: "short", confirm: "short" })),
      400
    );
    await fails(
      changePassword(fd({ current: "maple-7482", next: "sunflower-9", confirm: "sunflower-8" })),
      400
    );
    await fails(
      changePassword(fd({ current: "maple-7482", next: "maple-7482", confirm: "maple-7482" })),
      400
    );
    const r = await changePassword(
      fd({ current: "maple-7482", next: "sunflower-9", confirm: "sunflower-9" })
    );
    expect(r).toMatchObject({ ok: true });
    const user = (await db.query.users.findFirst({ where: eq(schema.users.id, ids.student) }))!;
    expect(user.mustChangePassword).toBe(false);
    expect(await verifyPassword("sunflower-9", user.passwordHash)).toBe(true);
    expect(await verifyPassword("maple-7482", user.passwordHash)).toBe(false);
    expect(await passwordStatus()).toMatchObject({ ok: true, data: { mustChange: false } });
  });
});
