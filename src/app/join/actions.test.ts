/**
 * Join codes: a student claims a roster name with the class code and gets a
 * username account; teachers manage codes and names. In-memory Postgres.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/session";

const state = vi.hoisted(() => ({ session: null as Session | null, signIns: [] as unknown[] }));

vi.mock("@/lib/session", () => ({ getCurrentSession: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined }));
vi.mock("@/auth", () => ({
  signIn: async (...args: unknown[]) => {
    state.signIns.push(args);
  },
  auth: async () => null,
}));
vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  findUserByIdentifier,
  generateJoinCode,
  normalizeJoinCode,
  usernameBase,
} from "@/lib/join";
import { verifyPassword } from "@/lib/password";
import { getClassDetail } from "@/lib/queries/classes";
import { parseRosterNames, tidyCase } from "@/lib/roster";
import {
  addRosterNames,
  regenerateJoinCode,
  removeRosterName,
  setJoinOpen,
} from "../app/classes/actions";
import { joinAnotherClass, joinClass, lookupJoinCode } from "./actions";

const ids = { teacher: "", other: "", cls: "", cls2: "", code: "", code2: "" };
const asUser = (userId: string, role: Session["role"], first = "T", last = "U") => {
  state.session = { userId, role, email: `${userId}@x`, firstName: first, lastName: last };
};
function fd(obj: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}
const ok = async <T>(
  p: Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }>
) => {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok, got ${r.status}: ${r.error}`);
  return r.data;
};
const fails = async (p: Promise<{ ok: boolean; status?: number }>, status: number) =>
  expect(p).resolves.toMatchObject({ ok: false, status });

beforeAll(async () => {
  const [t, o] = await db
    .insert(schema.users)
    .values([
      { email: "t@t", passwordHash: "x", role: "teacher", firstName: "Jon", lastName: "Erickson" },
      { email: "o@t", passwordHash: "x", role: "teacher", firstName: "O", lastName: "Ther" },
    ])
    .returning();
  ids.teacher = t.id;
  ids.other = o.id;
  const [c1, c2] = await db
    .insert(schema.classes)
    .values([
      { ownerId: t.id, name: "Biology · 3rd Hour", period: "3" },
      { ownerId: t.id, name: "Anatomy · 5th Hour", period: "5" },
    ])
    .returning();
  ids.cls = c1.id;
  ids.cls2 = c2.id;
});

describe("pure helpers", () => {
  it("codes are readable, normalized loosely, and usernames are ascii first.last", () => {
    expect(generateJoinCode("Biology · 3rd Hour", () => 0)).toBe("BIOL3-AAAA");
    expect(generateJoinCode("Anatomy and Physiology", () => 0.999)).toBe("ANAT-9999");
    expect(normalizeJoinCode(" bio3-k7qx ")).toBe("BIO3K7QX");
    expect(usernameBase("Karmalynne", "Barnard")).toBe("karmalynne.barnard");
    expect(usernameBase("Zendaya", "St Clair")).toBe("zendaya.stclair");
    expect(usernameBase("Bryson", "Simpson-Greene")).toBe("bryson.simpsongreene");
    expect(usernameBase("José", "Núñez")).toBe("jose.nunez");
  });
  it("title-cases all-caps names only", () => {
    expect(tidyCase("SIMPSON-GREENE")).toBe("Simpson-Greene");
    expect(tidyCase("ST CLAIR")).toBe("St Clair");
    expect(tidyCase("McDonald")).toBe("McDonald");
  });
  it("parses pasted rosters in either order and drops middle initials", () => {
    expect(
      parseRosterNames(
        "ALLARD, BRAEDEN R\n2 Amadon, Kayla\nLandon J Smith\nlast_name,first_name\n\nSt Clair, Zendaya R"
      )
    ).toEqual([
      { firstName: "Braeden", lastName: "Allard" },
      { firstName: "Kayla", lastName: "Amadon" },
      { firstName: "Landon", lastName: "J Smith" },
      { firstName: "Zendaya", lastName: "St Clair" },
    ]);
  });
});

describe("teacher: codes and names", () => {
  it("owner creates a code, adds names (dedupes), toggles joining; others get 403", async () => {
    asUser(ids.teacher, "teacher");
    ids.code = (await ok(regenerateJoinCode(ids.cls))).code;
    expect(ids.code).toMatch(/^BIOL3-[A-Z2-9]{4}$/);
    expect(
      await ok(
        addRosterNames(
          ids.cls,
          fd({ names: "Allard, Braeden R\nAmadon, Kayla\nSmith, Landon\nallard, braeden" })
        )
      )
    ).toEqual({ added: 3, skipped: 1 });
    expect(await ok(addRosterNames(ids.cls, fd({ names: "Amadon, Kayla" })))).toEqual({
      added: 0,
      skipped: 1,
    });
    const detail = (await getClassDetail(ids.cls))!;
    expect(detail.joinCode).toBe(ids.code);
    expect(detail.pending.map((n) => n.lastName)).toEqual(["Allard", "Amadon", "Smith"]);
    await ok(removeRosterName(ids.cls, detail.pending[2].id));
    expect((await getClassDetail(ids.cls))!.pending).toHaveLength(2);
    asUser(ids.other, "teacher");
    await fails(regenerateJoinCode(ids.cls), 403);
    await fails(addRosterNames(ids.cls, fd({ names: "X, Y" })), 403);
    await fails(setJoinOpen(ids.cls, false), 403);
  });
});

describe("student: joining", () => {
  it("looks up an open code (loose formatting) and lists only unclaimed names", async () => {
    state.session = null;
    const r = await ok(lookupJoinCode(ids.code.toLowerCase().replace("-", " ")));
    expect(r).toMatchObject({ className: "Biology · 3rd Hour", teacherName: "Jon Erickson" });
    expect(r.names.map((n) => n.lastName)).toEqual(["Allard", "Amadon"]);
    await fails(lookupJoinCode("NOPE-0000"), 404);
  });

  it("claims a name, creates a username account, enrolls, and signs in", async () => {
    const r = await ok(lookupJoinCode(ids.code));
    const allard = r.names.find((n) => n.lastName === "Allard")!;
    const res = await joinClass(
      null,
      fd({ code: ids.code, nameId: allard.id, password: "sunflower-42", confirm: "sunflower-42" })
    );
    expect(res).toEqual({ created: { username: "braeden.allard" } });
    const user = await findUserByIdentifier("Braeden.Allard");
    expect(user).toMatchObject({
      role: "student",
      firstName: "Braeden",
      lastName: "Allard",
      email: null,
      mustChangePassword: false,
    });
    expect(await verifyPassword("sunflower-42", user!.passwordHash)).toBe(true);
    expect(state.signIns.at(-1)).toEqual([
      "credentials",
      { email: "braeden.allard", password: "sunflower-42", redirectTo: "/student" },
    ]);
    const enrolled = await db.query.enrollments.findFirst({
      where: eq(schema.enrollments.studentId, user!.id),
    });
    expect(enrolled?.classId).toBe(ids.cls);
    expect((await ok(lookupJoinCode(ids.code))).names.map((n) => n.lastName)).toEqual(["Amadon"]);
    // The same name can't be claimed twice.
    const again = await joinClass(
      null,
      fd({ code: ids.code, nameId: allard.id, password: "sunflower-42", confirm: "sunflower-42" })
    );
    expect(again?.error).toMatch(/already joined/);
  });

  it("validates the form; a name not on the list is created and flagged; duplicate names get numbered usernames", async () => {
    expect(
      await joinClass(null, fd({ code: ids.code, password: "short", confirm: "short" }))
    ).toMatchObject({ fieldErrors: { password: expect.any(String), nameId: expect.any(String) } });
    expect(
      await joinClass(
        null,
        fd({
          code: ids.code,
          firstName: "Ari",
          lastName: "Kim",
          password: "sunflower-42",
          confirm: "nope",
        })
      )
    ).toMatchObject({ fieldErrors: { confirm: "Passwords don't match." } });
    const typed = await joinClass(
      null,
      fd({
        code: ids.code,
        firstName: "Braeden",
        lastName: "Allard",
        password: "sunflower-43",
        confirm: "sunflower-43",
      })
    );
    expect(typed).toEqual({ created: { username: "braeden.allard2" } });
    const detail = (await getClassDetail(ids.cls))!;
    const rows = detail.roster.filter((r) => r.lastName === "Allard");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.selfEntered).sort()).toEqual([false, true]);
    expect(rows.map((r) => r.username).sort()).toEqual(["braeden.allard", "braeden.allard2"]);
  });

  it("a closed code refuses lookups and joins", async () => {
    asUser(ids.teacher, "teacher");
    await ok(setJoinOpen(ids.cls, false));
    state.session = null;
    await fails(lookupJoinCode(ids.code), 403);
    expect(
      (
        await joinClass(
          null,
          fd({
            code: ids.code,
            firstName: "A",
            lastName: "B",
            password: "sunflower-42",
            confirm: "sunflower-42",
          })
        )
      )?.error
    ).toMatch(/closed/);
    asUser(ids.teacher, "teacher");
    await ok(setJoinOpen(ids.cls, true));
  });

  it("a signed-in student joins a second class with its code and claims a matching name", async () => {
    asUser(ids.teacher, "teacher");
    ids.code2 = (await ok(regenerateJoinCode(ids.cls2))).code;
    await ok(addRosterNames(ids.cls2, fd({ names: "Allard, Braeden" })));
    const user = (await findUserByIdentifier("braeden.allard"))!;
    asUser(user.id, "student", "Braeden", "Allard");
    expect(await ok(joinAnotherClass(ids.code2))).toMatchObject({
      className: "Anatomy · 5th Hour",
      alreadyEnrolled: false,
    });
    expect(await ok(joinAnotherClass(ids.code2))).toMatchObject({ alreadyEnrolled: true });
    expect((await getClassDetail(ids.cls2))!.pending).toHaveLength(0);
    await fails(joinAnotherClass("NOPE-0000"), 404);
    asUser(ids.teacher, "teacher");
    await fails(joinAnotherClass(ids.code2), 403);
  });

  it("regenerating the code retires the old one", async () => {
    asUser(ids.teacher, "teacher");
    const { code } = await ok(regenerateJoinCode(ids.cls));
    expect(code).not.toBe(ids.code);
    state.session = null;
    await fails(lookupJoinCode(ids.code), 404);
    await ok(lookupJoinCode(code));
  });
});
