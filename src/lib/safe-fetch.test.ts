import { describe, expect, it } from "vitest";
import { fetchPublicBytes, isPrivateAddress, isPublicHttpUrl } from "./safe-fetch";

const publicDns = async () => ["93.184.216.34"];
const inwardDns = async () => ["10.0.0.5"];

describe("server-side fetches stay on the public internet (H4.6)", () => {
  it("knows private, loopback and link-local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254"])
      expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])
      expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111", "172.32.0.1"])
      expect(isPrivateAddress(ip)).toBe(false);
  });

  it("allows a public web address and refuses everything else", async () => {
    expect(await isPublicHttpUrl("https://example.com/cell.png", publicDns)).toBe(true);
    expect(await isPublicHttpUrl("http://169.254.169.254/latest/meta-data", publicDns)).toBe(false);
    expect(await isPublicHttpUrl("http://localhost:3000/x", publicDns)).toBe(false);
    expect(await isPublicHttpUrl("http://[::1]/x", publicDns)).toBe(false);
    expect(await isPublicHttpUrl("file:///etc/passwd", publicDns)).toBe(false);
    expect(await isPublicHttpUrl("https://user:pw@example.com/x", publicDns)).toBe(false);
    expect(await isPublicHttpUrl("not a url", publicDns)).toBe(false);
    // A public-looking name that points inward.
    expect(await isPublicHttpUrl("https://images.example.com/x.png", inwardDns)).toBe(false);
  });

  const respond = (body: Uint8Array, init?: ResponseInit) => new Response(body as BodyInit, init);

  it("returns the bytes of a public image", async () => {
    const bytes = await fetchPublicBytes("https://example.com/a.png", {
      resolve: publicDns,
      fetchImpl: (async () => respond(new Uint8Array([1, 2, 3]))) as typeof fetch,
    });
    expect([...(bytes ?? [])]).toEqual([1, 2, 3]);
  });

  it("refuses a private address without fetching it", async () => {
    let called = false;
    const bytes = await fetchPublicBytes("http://10.0.0.5/admin", {
      fetchImpl: (async () => {
        called = true;
        return respond(new Uint8Array([1]));
      }) as typeof fetch,
    });
    expect(bytes).toBeNull();
    expect(called).toBe(false);
  });

  it("checks a redirect before following it", async () => {
    const seen: string[] = [];
    const bytes = await fetchPublicBytes("https://example.com/a.png", {
      resolve: publicDns,
      fetchImpl: (async (u: string) => {
        seen.push(u);
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/secret" },
        });
      }) as typeof fetch,
    });
    expect(bytes).toBeNull();
    expect(seen).toEqual(["https://example.com/a.png"]);
  });

  it("gives up on a response that is too big", async () => {
    const bytes = await fetchPublicBytes("https://example.com/huge.png", {
      resolve: publicDns,
      maxBytes: 4,
      fetchImpl: (async () => respond(new Uint8Array(10))) as typeof fetch,
    });
    expect(bytes).toBeNull();
  });
});
