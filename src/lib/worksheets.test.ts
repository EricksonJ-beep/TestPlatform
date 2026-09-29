import { describe, expect, it } from "vitest";
import {
  creditedTargets,
  creditsTarget,
  normalizeStudentUrl,
  parseWorksheetRef,
  pendingScriptId,
  webhookBlock,
} from "./worksheet-rules";

describe("parseWorksheetRef", () => {
  it("reads a deployed student link (plain and domain forms), dropping query and /dev", () => {
    expect(
      parseWorksheetRef("https://script.google.com/macros/s/AKfycbxDEPLOY123/exec?x=1")
    ).toEqual({
      scriptId: null,
      studentUrl: "https://script.google.com/macros/s/AKfycbxDEPLOY123/exec",
    });
    expect(
      parseWorksheetRef(
        "https://script.google.com/a/macros/cadott.k12.wi.us/s/AKfycbxDEPLOY123/dev"
      )
    ).toEqual({
      scriptId: null,
      studentUrl: "https://script.google.com/a/macros/cadott.k12.wi.us/s/AKfycbxDEPLOY123/exec",
    });
  });
  it("reads an editor link or a bare script id", () => {
    const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghijk";
    expect(parseWorksheetRef(`https://script.google.com/d/${id}/edit`)).toEqual({
      scriptId: id,
      studentUrl: null,
    });
    expect(parseWorksheetRef(`https://script.google.com/home/projects/${id}/edit`)).toEqual({
      scriptId: id,
      studentUrl: null,
    });
    expect(parseWorksheetRef(`  ${id} `)).toEqual({ scriptId: id, studentUrl: null });
    expect(parseWorksheetRef("hello")).toBeNull();
    expect(parseWorksheetRef("")).toBeNull();
  });
  it("normalizes and derives the pending id", () => {
    expect(normalizeStudentUrl("https://x.y/a/b?c=1#d")).toBe("https://x.y/a/b");
    expect(pendingScriptId("https://x.y/a/b?c=1")).toBe("pending:https://x.y/a/b");
  });
});

describe("creditedTargets", () => {
  const targetIds = ["lt1", "lt4"];
  it("credits everything with no map", () => {
    expect(
      creditedTargets({ sectionTargetMap: null, sectionScores: { "Part A": 50 }, targetIds })
    ).toBeNull();
    expect(
      creditedTargets({ sectionTargetMap: { "Part A": "other" }, sectionScores: null, targetIds })
    ).toBeNull();
  });
  it("credits a mapped target only when its section scored, and unmapped targets always", () => {
    const map = { "Part D: LT4": "lt4" };
    expect(
      creditedTargets({
        sectionTargetMap: map,
        sectionScores: { "Part A": 100, "Part D: LT4": 0 },
        targetIds,
      })
    ).toEqual(["lt1"]);
    expect(
      creditedTargets({ sectionTargetMap: map, sectionScores: { "part d: lt4 ": 40 }, targetIds })
    ).toEqual(["lt1", "lt4"]);
    expect(creditedTargets({ sectionTargetMap: map, sectionScores: null, targetIds })).toEqual([
      "lt1",
    ]);
  });
  it("creditsTarget treats a missing list as full credit", () => {
    expect(creditsTarget(undefined, "lt4")).toBe(true);
    expect(creditsTarget(["lt1"], "lt4")).toBe(false);
    expect(creditsTarget(["lt1", "lt4"], "lt4")).toBe(true);
  });
});

describe("webhookBlock", () => {
  it("fills in the URL and secret and keeps the Appendix B shape", () => {
    const block = webhookBlock("https://bloom.example/api/integrations/worksheet", "s3cret");
    expect(block).toContain(
      "const BLOOM_WEBHOOK_URL = 'https://bloom.example/api/integrations/worksheet';"
    );
    expect(block).toContain("const BLOOM_SECRET      = 's3cret';");
    expect(block).toContain("X-Bloom-Secret");
    expect(block).toContain("ScriptApp.getScriptId()");
    expect(block).toContain("event: 'submit'");
  });
});
