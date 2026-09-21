/**
 * Small RFC 4180-style CSV parser and writer. Handles quoted cells, embedded
 * commas/newlines, doubled quotes, CRLF, and a UTF-8 BOM. Used for rosters now
 * and question import in Phase 1.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Drop rows that are entirely empty (trailing newline, blank lines).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Parse with a header row: returns objects keyed by normalized header (lowercase, trimmed). */
export function parseCsvRecords(text: string): {
  headers: string[];
  records: Record<string, string>[];
} {
  const rows = parseCsv(text);
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const records = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = (r[i] ?? "").trim();
    });
    return rec;
  });
  return { headers, records };
}

function escapeCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers, ...rows].map((r) => r.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}
