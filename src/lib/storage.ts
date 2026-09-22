/**
 * Cloudflare R2 (S3-compatible) storage for images, video, and audio.
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
 * Optional: R2_PUBLIC_URL (a public bucket / custom domain; when set, media is
 * served straight from it) and R2_ENDPOINT (override; tests point it at a stub).
 *
 * Without R2_PUBLIC_URL, media is streamed through /api/media/<key>, which checks
 * the session, so bucket credentials never reach the browser either way.
 */
import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { MEDIA_RULES, kindForMime, type MediaKind } from "./storage-rules";
export { MEDIA_RULES, kindForMime, type MediaKind };

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/webm": "weba",
};

/** Validates a proposed upload. Returns an error message or null. */
export function validateUpload(input: {
  contentType: string;
  size: number;
  kind?: MediaKind;
}): string | null {
  const kind = kindForMime(input.contentType);
  if (!kind)
    return "That file type isn't supported. Use an image (JPEG, PNG, GIF, WebP), video (MP4, WebM), or audio (MP3, M4A, WAV).";
  if (input.kind && input.kind !== kind) return `Expected ${input.kind}, got ${kind}.`;
  if (input.size <= 0) return "That file is empty.";
  if (input.size > MEDIA_RULES[kind].maxBytes) return `Too large: ${MEDIA_RULES[kind].label}.`;
  return null;
}

/** Object keys are namespaced per owner and never reuse a client-supplied name. */
export function objectKey(ownerId: string, contentType: string): string {
  const ext = EXT[contentType] ?? "bin";
  const y = new Date().getUTCFullYear();
  return `u/${ownerId}/${y}/${randomUUID()}.${ext}`;
}

const KEY_PATTERN = /^u\/[0-9a-f-]{36}\/\d{4}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;
export function isValidKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export type StorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  publicUrl: string | null;
};

export function getStorageConfig(): StorageConfig | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: process.env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`,
    publicUrl: process.env.R2_PUBLIC_URL?.trim().replace(/\/$/, "") || null,
  };
}

export const isStorageConfigured = () => getStorageConfig() !== null;

let client: S3Client | null = null;
let clientEndpoint = "";
function s3(cfg: StorageConfig): S3Client {
  if (!client || clientEndpoint !== cfg.endpoint) {
    client = new S3Client({
      region: "auto",
      endpoint: cfg.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
    clientEndpoint = cfg.endpoint;
  }
  return client;
}

/** The URL the app stores and renders. Public bucket if configured, otherwise the session-checked proxy. */
export function urlForKey(key: string, cfg = getStorageConfig()): string {
  return cfg?.publicUrl ? `${cfg.publicUrl}/${key}` : `/api/media/${key}`;
}

export function isMediaProxyUrl(url: string): boolean {
  return url.startsWith("/api/media/u/");
}

/** Presigned PUT for a direct browser upload (10 minutes). */
export async function createUploadUrl(
  key: string,
  contentType: string,
  contentLength: number
): Promise<string> {
  const cfg = getStorageConfig();
  if (!cfg) throw new Error("Storage is not configured.");
  const cmd = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(s3(cfg), cmd, { expiresIn: 600 });
}

/** Confirms an object landed and returns its size and type. */
export async function headObject(
  key: string
): Promise<{ size: number; contentType: string | null } | null> {
  const cfg = getStorageConfig();
  if (!cfg) throw new Error("Storage is not configured.");
  try {
    const r = await s3(cfg).send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? null };
  } catch (err) {
    if (
      (err as { name?: string }).name === "NotFound" ||
      (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
    )
      return null;
    throw err;
  }
}

/** Server-side upload (the CSV importer's zip path). */
export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  const cfg = getStorageConfig();
  if (!cfg) throw new Error("Storage is not configured.");
  await s3(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
    })
  );
}

/** Stream an object for the /api/media proxy. */
export async function getObjectStream(
  key: string
): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number | null;
  etag: string | null;
} | null> {
  const cfg = getStorageConfig();
  if (!cfg) throw new Error("Storage is not configured.");
  try {
    const r = await s3(cfg).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
    if (!r.Body) return null;
    return {
      body: r.Body.transformToWebStream() as ReadableStream<Uint8Array>,
      contentType: r.ContentType ?? "application/octet-stream",
      contentLength: r.ContentLength ?? null,
      etag: r.ETag ?? null,
    };
  } catch (err) {
    if (
      (err as { name?: string }).name === "NoSuchKey" ||
      (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
    )
      return null;
    throw err;
  }
}
