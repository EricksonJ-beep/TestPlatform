import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { createTestDb } = await import("@/test/db");
  const { db, schema } = await createTestDb();
  return { db, schema, dbDriver: "pg" };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));

import { clearFailures, clientAddress, isThrottled, recordFailure, throttleKey } from "./throttle";

const rule = { max: 3, windowMs: 10 * 60_000 };
const at = (min: number) => new Date(Date.UTC(2026, 10, 9, 14, min));

describe("throttle (H4.1)", () => {
  it("lets tries through until the limit, then refuses", async () => {
    const key = throttleKey("login", "Jane.Smith ");
    expect(key).toBe("login:jane.smith");
    expect(await isThrottled(key, rule, at(0))).toBe(false);
    await recordFailure(key, rule, at(0));
    await recordFailure(key, rule, at(1));
    expect(await isThrottled(key, rule, at(1))).toBe(false);
    await recordFailure(key, rule, at(2));
    expect(await isThrottled(key, rule, at(2))).toBe(true);
  });

  it("opens again when the window ends, and the count starts over", async () => {
    const key = throttleKey("login", "jane.smith");
    expect(await isThrottled(key, rule, at(9))).toBe(true);
    expect(await isThrottled(key, rule, at(10))).toBe(false);
    await recordFailure(key, rule, at(11)); // first failure of a new window
    expect(await isThrottled(key, rule, at(11))).toBe(false);
    await recordFailure(key, rule, at(12));
    await recordFailure(key, rule, at(13));
    expect(await isThrottled(key, rule, at(13))).toBe(true);
    expect(await isThrottled(key, rule, at(20))).toBe(true); // window began at :11
    expect(await isThrottled(key, rule, at(21))).toBe(false);
  });

  it("a success clears the count", async () => {
    const key = throttleKey("code", "student-1", "assignment-1");
    await recordFailure(key, rule, at(0));
    await recordFailure(key, rule, at(0));
    await clearFailures(key);
    await recordFailure(key, rule, at(1));
    await recordFailure(key, rule, at(1));
    expect(await isThrottled(key, rule, at(1))).toBe(false);
  });

  it("keys are separate: one student's misses don't lock another", async () => {
    const a = throttleKey("code", "student-a");
    const b = throttleKey("code", "student-b");
    for (let i = 0; i < 3; i++) await recordFailure(a, rule, at(0));
    expect(await isThrottled(a, rule, at(0))).toBe(true);
    expect(await isThrottled(b, rule, at(0))).toBe(false);
  });

  it("reads the first forwarded address", async () => {
    expect(await clientAddress()).toBe("203.0.113.7");
  });
});
