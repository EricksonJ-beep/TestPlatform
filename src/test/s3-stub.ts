/**
 * Minimal in-memory S3-compatible server for tests: PUT / GET / HEAD on
 * /<bucket>/<key>, no auth. Point R2_ENDPOINT at it.
 */
import { createServer, type Server } from "node:http";

export type S3Stub = {
  url: string;
  server: Server;
  objects: Map<string, { body: Buffer; contentType: string }>;
  close: () => Promise<void>;
};

export function startS3Stub(bucket: string): Promise<S3Stub> {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const server = createServer((req, res) => {
    // Same CORS rule a real R2 bucket needs for browser uploads (PUT with Content-Type).
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Content-Length");
    res.setHeader("Access-Control-Expose-Headers", "ETag");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://x");
    const prefix = `/${bucket}/`;
    if (!url.pathname.startsWith(prefix)) {
      res.writeHead(404).end();
      return;
    }
    const key = decodeURIComponent(url.pathname.slice(prefix.length));
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        objects.set(key, {
          body: Buffer.concat(chunks),
          contentType: String(req.headers["content-type"] ?? "application/octet-stream"),
        });
        res.writeHead(200, { ETag: `"${key.length}"` }).end();
      });
      return;
    }
    const obj = objects.get(key);
    if (!obj) {
      res.writeHead(404).end();
      return;
    }
    const headers = {
      "Content-Type": obj.contentType,
      "Content-Length": String(obj.body.length),
      ETag: `"${key.length}"`,
    };
    if (req.method === "HEAD") {
      res.writeHead(200, headers).end();
      return;
    }
    if (req.method === "GET") {
      res.writeHead(200, headers).end(obj.body);
      return;
    }
    res.writeHead(405).end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        server,
        objects,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
