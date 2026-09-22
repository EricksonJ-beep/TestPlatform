import { describe, expect, it } from "vitest";
import { isValidKey, objectKey, urlForKey, validateUpload } from "./storage";

describe("storage rules", () => {
  it("accepts allowed types within limits and rejects the rest", () => {
    expect(validateUpload({ contentType: "image/png", size: 1000 })).toBeNull();
    expect(validateUpload({ contentType: "video/mp4", size: 50 * 1024 * 1024 })).toBeNull();
    expect(validateUpload({ contentType: "image/png", size: 11 * 1024 * 1024 })).toMatch(
      /Too large/
    );
    expect(validateUpload({ contentType: "application/pdf", size: 10 })).toMatch(/isn't supported/);
    expect(validateUpload({ contentType: "image/png", size: 0 })).toMatch(/empty/);
    expect(validateUpload({ contentType: "image/png", size: 10, kind: "video" })).toMatch(
      /Expected video/
    );
  });

  it("mints owner-namespaced keys and validates their shape", () => {
    const owner = "0d0ce9c3-6e2d-42e3-bad4-69e361c06b49";
    const key = objectKey(owner, "image/jpeg");
    expect(key.startsWith(`u/${owner}/`)).toBe(true);
    expect(key.endsWith(".jpg")).toBe(true);
    expect(isValidKey(key)).toBe(true);
    expect(isValidKey("u/../etc/passwd")).toBe(false);
    expect(isValidKey("anything.png")).toBe(false);
  });

  it("serves through the proxy unless a public URL is configured", () => {
    const key =
      "u/0d0ce9c3-6e2d-42e3-bad4-69e361c06b49/2026/2bb3a3b1-3a0e-4a4c-9a6d-7d1a2a4d5b6c.png";
    expect(urlForKey(key, null)).toBe(`/api/media/${key}`);
    expect(
      urlForKey(key, {
        accountId: "a",
        accessKeyId: "k",
        secretAccessKey: "s",
        bucket: "b",
        endpoint: "e",
        publicUrl: "https://media.example.org",
      })
    ).toBe(`https://media.example.org/${key}`);
  });
});
