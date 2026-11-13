import { describe, expect, it } from "vitest";
import { errorLogLine } from "./error-log";

describe("server error log line (H7.2)", () => {
  const at = new Date(Date.UTC(2026, 10, 9, 15, 30));
  it("is one line with the page's reference, the route and the error", () => {
    const err = Object.assign(new Error('relation "auth_throttle" does not exist'), {
      digest: "1234567890",
    });
    const line = errorLogLine(
      err,
      { path: "/student/attempt/abc?tab=1&token=secret", method: "POST" },
      { routePath: "/student/attempt/[attemptId]", routeType: "action" },
      at
    );
    expect(line.startsWith("[bloom-error] ")).toBe(true);
    expect(line).not.toContain("\n");
    const data = JSON.parse(line.slice("[bloom-error] ".length));
    expect(data).toMatchObject({
      at: "2026-11-09T15:30:00.000Z",
      digest: "1234567890",
      message: 'relation "auth_throttle" does not exist',
      method: "POST",
      path: "/student/attempt/abc",
      route: "/student/attempt/[attemptId]",
      kind: "action",
    });
    // The query string (which could carry anything) is never logged.
    expect(line).not.toContain("secret");
  });
  it("copes with something that isn't an Error", () => {
    const line = errorLogLine("boom", { path: "/app", method: "GET" }, {}, at);
    expect(JSON.parse(line.slice(14))).toMatchObject({
      message: "boom",
      digest: null,
      route: null,
    });
  });
});
