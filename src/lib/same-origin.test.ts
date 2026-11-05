import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./same-origin";

const req = (headers: Record<string, string>) =>
  new Request("https://bloom.example/api/x", { method: "POST", headers });

describe("isSameOrigin", () => {
  it("accepts Bloom's own pages and refuses everything else", () => {
    expect(isSameOrigin(req({ host: "bloom.example", origin: "https://bloom.example" }))).toBe(
      true
    );
    expect(
      isSameOrigin(req({ host: "bloom.example", referer: "https://bloom.example/app/skyward" }))
    ).toBe(true);
    expect(
      isSameOrigin(
        req({
          "x-forwarded-host": "bloom.example",
          host: "internal:3000",
          origin: "https://bloom.example",
        })
      )
    ).toBe(true);
    expect(isSameOrigin(req({ host: "bloom.example", origin: "https://evil.example" }))).toBe(
      false
    );
    expect(isSameOrigin(req({ host: "bloom.example" }))).toBe(false);
    expect(isSameOrigin(req({ host: "bloom.example", origin: "not a url" }))).toBe(false);
  });
});
