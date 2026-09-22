import { describe, expect, it } from "vitest";
import { parseRichText, richTextToPlain } from "./richtext";

describe("richtext", () => {
  it("parses sub/superscript, math, bold, italic, and line breaks", () => {
    const segs = parseRichText("H_{2}O and E = mc^{2}, $\\frac{d}{t}$\n**bold** *it*");
    expect(segs).toEqual([
      { kind: "text", text: "H" },
      { kind: "sub", text: "2" },
      { kind: "text", text: "O and E = mc" },
      { kind: "sup", text: "2" },
      { kind: "text", text: ", " },
      { kind: "math", tex: "\\frac{d}{t}", display: false },
      { kind: "br" },
      { kind: "bold", text: "bold" },
      { kind: "text", text: " " },
      { kind: "italic", text: "it" },
    ]);
  });

  it("leaves plain text alone, including underscores in words and prices", () => {
    expect(parseRichText("snake_case and $5 total")).toEqual([
      { kind: "text", text: "snake_case and $5 total" },
    ]);
  });

  it("renders a plain-text fallback with unicode scripts", () => {
    expect(richTextToPlain("CO_{2} + 10^{3}")).toBe("CO₂ + 10³");
  });
});
