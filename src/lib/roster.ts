/**
 * Roster text helpers shared by the class actions and their tests.
 */
/** Parse pasted names: one per line, "Last, First" or "First Last"; a trailing middle initial is dropped. */
export function parseRosterNames(text: string): { firstName: string; lastName: string }[] {
  const out: { firstName: string; lastName: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*\d+[.)]?\s*/, "").trim();
    if (!line || /^(last[_ ]?name|first[_ ]?name)\b/i.test(line)) continue;
    let first: string;
    let last: string;
    if (line.includes(",")) {
      const [l, f] = line.split(",", 2).map((s) => s.trim());
      last = l;
      first = f;
    } else {
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      first = parts[0];
      last = parts.slice(1).join(" ");
    }
    first =
      first
        .split(/\s+/)
        .filter((p) => !/^[A-Za-z]\.?$/.test(p) || p === first)
        .join(" ") || first;
    last = last.replace(/\s+[A-Za-z]\.?$/, "").trim();
    if (first && last) out.push({ firstName: tidyCase(first), lastName: tidyCase(last) });
  }
  return out;
}

/** "ALLARD" → "Allard", "SIMPSON-GREENE" → "Simpson-Greene"; mixed-case input is left alone. */
export function tidyCase(name: string): string {
  if (name !== name.toUpperCase() || !/[A-Z]/.test(name)) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}
