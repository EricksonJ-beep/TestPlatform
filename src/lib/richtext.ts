/**
 * Bloom's light rich-text markup for stems, options, and explanations.
 *
 *   H_{2}O          → subscript          CO_{2}, x_{1}
 *   10^{3}          → superscript        E = mc^{2}
 *   $\frac{d}{t}$   → inline LaTeX       rendered with KaTeX
 *   $$ ... $$       → display LaTeX
 *   **bold**, *italic*, line breaks are kept.
 *
 * Plain text stays plain, so CSV imports render unchanged. The parser is
 * shared by the server-side plain-text fallback and the client renderer.
 */

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "sub"; text: string }
  | { kind: "sup"; text: string }
  | { kind: "math"; tex: string; display: boolean }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "br" };

const TOKEN =
  /(\$\$[\s\S]+?\$\$)|(\$[^$\n]+?\$)|([A-Za-z0-9)\]])_\{([^}]*)\}|([A-Za-z0-9)\]])\^\{([^}]*)\}|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\n)/g;

export function parseRichText(input: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of input.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ kind: "text", text: input.slice(last, i) });
    if (m[1]) out.push({ kind: "math", tex: m[1].slice(2, -2).trim(), display: true });
    else if (m[2]) out.push({ kind: "math", tex: m[2].slice(1, -1).trim(), display: false });
    else if (m[3] !== undefined) {
      out.push({ kind: "text", text: m[3] });
      out.push({ kind: "sub", text: m[4] });
    } else if (m[5] !== undefined) {
      out.push({ kind: "text", text: m[5] });
      out.push({ kind: "sup", text: m[6] });
    } else if (m[7]) out.push({ kind: "bold", text: m[7].slice(2, -2) });
    else if (m[8]) out.push({ kind: "italic", text: m[8].slice(1, -1) });
    else if (m[9]) out.push({ kind: "br" });
    last = i + m[0].length;
  }
  if (last < input.length) out.push({ kind: "text", text: input.slice(last) });
  // Merge adjacent plain-text segments so renderers get one node per run.
  const merged: Segment[] = [];
  for (const s of out) {
    const prev = merged[merged.length - 1];
    if (s.kind === "text" && prev && prev.kind === "text") prev.text += s.text;
    else merged.push(s.kind === "text" ? { ...s } : s);
  }
  return merged;
}

const SUB: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  n: "ₙ",
  x: "ₓ",
  a: "ₐ",
  e: "ₑ",
  o: "ₒ",
  i: "ᵢ",
};
const SUP: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
  i: "ⁱ",
};

/** Plain-text rendering (exports, print, search previews): Unicode sub/superscripts, math kept as-is. */
export function richTextToPlain(input: string): string {
  return parseRichText(input)
    .map((s) => {
      switch (s.kind) {
        case "text":
        case "bold":
        case "italic":
          return s.text;
        case "sub":
          return [...s.text].map((c) => SUB[c] ?? c).join("");
        case "sup":
          return [...s.text].map((c) => SUP[c] ?? c).join("");
        case "math":
          return s.tex;
        case "br":
          return "\n";
      }
    })
    .join("");
}

export const RICHTEXT_HELP =
  "H_{2}O for subscript, 10^{3} for superscript, $\\frac{d}{t}$ for math, **bold**, *italic*.";
