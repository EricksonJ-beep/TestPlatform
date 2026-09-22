"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionError, requireTeacher, withAuthz } from "@/lib/authz";
import {
  createUploadUrl,
  headObject,
  isStorageConfigured,
  isValidKey,
  kindForMime,
  objectKey,
  urlForKey,
  validateUpload,
} from "@/lib/storage";

const requestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
  kind: z.enum(["image", "video", "audio"]).optional(),
});

export type UploadTicket = { key: string; uploadUrl: string; url: string };

/** Step 1: a teacher asks for a presigned PUT URL. The key is server-generated and owner-namespaced. */
export const requestUpload = withAuthz(async (input: unknown): Promise<UploadTicket> => {
  const session = await requireTeacher();
  if (!isStorageConfigured()) {
    throw new ActionError(
      "Media storage isn't set up yet. Add the R2_* variables (see .env.example).",
      503
    );
  }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new ActionError("Invalid upload request.", 400);
  const problem = validateUpload(parsed.data);
  if (problem) throw new ActionError(problem, 400);
  const key = objectKey(session.userId, parsed.data.contentType);
  const uploadUrl = await createUploadUrl(key, parsed.data.contentType, parsed.data.size);
  return { key, uploadUrl, url: urlForKey(key) };
});

const completeSchema = z.object({
  key: z.string(),
  altText: z.string().trim().max(300).optional().nullable(),
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
  durationSeconds: z.number().int().nonnegative().optional().nullable(),
});

export type MediaAssetSummary = {
  id: string;
  url: string;
  kind: "image" | "video" | "audio";
  key: string;
};

/** Step 2: after the PUT, confirm the object exists (and still fits the rules) and record it. */
export const completeUpload = withAuthz(async (input: unknown): Promise<MediaAssetSummary> => {
  const session = await requireTeacher();
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) throw new ActionError("Invalid upload.", 400);
  const { key } = parsed.data;
  // Rule: a teacher may only register objects under their own namespace.
  if (!isValidKey(key) || !key.startsWith(`u/${session.userId}/`))
    throw new ActionError("That upload isn't yours.", 403);

  const head = await headObject(key);
  if (!head) throw new ActionError("The file never arrived. Try uploading again.", 400);
  const contentType = head.contentType ?? "application/octet-stream";
  const kind = kindForMime(contentType);
  const problem = validateUpload({ contentType, size: head.size });
  if (!kind || problem) throw new ActionError(problem ?? "Unsupported file.", 400);

  const url = urlForKey(key);
  const [asset] = await db
    .insert(schema.mediaAssets)
    .values({
      ownerId: session.userId,
      kind,
      storageKey: key,
      url,
      mimeType: contentType,
      sizeBytes: head.size,
      width: parsed.data.width ?? null,
      height: parsed.data.height ?? null,
      durationSeconds: parsed.data.durationSeconds ?? null,
      altText: parsed.data.altText ?? null,
    })
    .returning({ id: schema.mediaAssets.id });
  return { id: asset.id, url, kind, key };
});

/** Tells the editor whether uploads are possible right now. */
export const storageStatus = withAuthz(async () => {
  await requireTeacher();
  return { configured: isStorageConfigured() };
});

/** Look up an asset the teacher owns (used when linking imported files). */
export const findMyAssetByUrl = withAuthz(async (url: string) => {
  const session = await requireTeacher();
  const asset = await db.query.mediaAssets.findFirst({
    columns: { id: true, url: true, kind: true },
    where: eq(schema.mediaAssets.url, url),
  });
  if (!asset) return null;
  const owned = await db.query.mediaAssets.findFirst({
    columns: { ownerId: true },
    where: eq(schema.mediaAssets.id, asset.id),
  });
  return owned?.ownerId === session.userId ? asset : null;
});
