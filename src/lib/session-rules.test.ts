import { describe, expect, it } from "vitest";
import { sessionEnded } from "./session-rules";

const at = (h: number) => new Date(Date.UTC(2026, 10, 9, h));

describe("a session ends when the password changes (H4.2)", () => {
  it("a session with no password change since is good", () => {
    expect(sessionEnded({ passwordChangedAt: null }, at(9).getTime())).toBe(false);
    expect(sessionEnded({ passwordChangedAt: at(8) }, at(9).getTime())).toBe(false);
  });
  it("a reset after the session began ends it", () => {
    expect(sessionEnded({ passwordChangedAt: at(10) }, at(9).getTime())).toBe(true);
  });
  it("signing in again after the reset is a good session", () => {
    expect(sessionEnded({ passwordChangedAt: at(10) }, at(10).getTime() + 1)).toBe(false);
  });
  it("a session from before this rule (no start time) ends only once a password changes", () => {
    expect(sessionEnded({ passwordChangedAt: null }, 0)).toBe(false);
    expect(sessionEnded({ passwordChangedAt: at(10) }, 0)).toBe(true);
  });
  it("a deleted account has no session", () => {
    expect(sessionEnded(null, at(9).getTime())).toBe(true);
  });
});
