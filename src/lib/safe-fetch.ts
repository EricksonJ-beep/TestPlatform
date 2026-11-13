/**
 * Fetching an address a teacher typed, from the server (hardening plan H4.6, Nov 9 2026).
 *
 * The paper export downloads each question's image. An image address is whatever was typed
 * into the question, so without a check the server could be pointed at its own network. Only
 * public web addresses are fetched, with a time limit and a size limit, and each redirect is
 * checked again.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** True for an address that is private, loopback, link-local or otherwise not the public internet. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (kind === 6) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      v === "::" ||
      v === "::1" ||
      v.startsWith("fc") ||
      v.startsWith("fd") ||
      /^fe[89ab]/.test(v) ||
      v.startsWith("ff")
    );
  }
  return true; // not an address at all
}

/** Is this a web address on the public internet? Looks the name up, so a name that points inward is refused too. */
export async function isPublicHttpUrl(
  raw: string | URL,
  resolve: (host: string) => Promise<string[]> = async (host) =>
    (await lookup(host, { all: true })).map((r) => r.address)
): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || /\.(local|internal|localhost)$/.test(host)) return false;
  if (isIP(host)) return !isPrivateAddress(host);
  try {
    const addresses = await resolve(host);
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a));
  } catch {
    return false;
  }
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
  resolve?: (host: string) => Promise<string[]>;
};

/** The bytes at a public address, or null: refused, too slow, too big, or not there. */
export async function fetchPublicBytes(
  raw: string | URL,
  opts: SafeFetchOptions = {}
): Promise<Uint8Array | null> {
  const { timeoutMs = 8000, maxBytes = 10 * 1024 * 1024, maxRedirects = 3 } = opts;
  const doFetch = opts.fetchImpl ?? fetch;
  let url = String(raw);
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (!(await isPublicHttpUrl(url, opts.resolve))) return null;
      const r = await doFetch(url, { redirect: "manual", signal });
      if (r.status >= 300 && r.status < 400) {
        const next = r.headers.get("location");
        if (!next) return null;
        url = new URL(next, url).toString();
        continue;
      }
      if (!r.ok || !r.body) return null;
      if (Number(r.headers.get("content-length") ?? 0) > maxBytes) return null;
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    }
    return null;
  } catch {
    return null;
  }
}
