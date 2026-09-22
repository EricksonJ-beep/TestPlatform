/**
 * Stimulus reads. A stimulus is a passage, image, video, or audio clip owned by
 * a course and attached to a group of questions. Callers must have passed the
 * course/bank access check first.
 */
import { and, asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type StimulusRow = {
  id: string;
  courseId: string | null;
  kind: "text" | "image" | "video" | "audio";
  title: string | null;
  ref: string | null;
  content: string | null;
  mediaUrl: string | null;
  questions: number;
  updatedAt: Date;
};

export async function listStimuli(courseId: string): Promise<StimulusRow[]> {
  return db
    .select({
      id: schema.stimuli.id,
      courseId: schema.stimuli.courseId,
      kind: schema.stimuli.kind,
      title: schema.stimuli.title,
      ref: schema.stimuli.ref,
      content: schema.stimuli.content,
      mediaUrl: schema.stimuli.mediaUrl,
      questions: count(schema.questions.id),
      updatedAt: schema.stimuli.updatedAt,
    })
    .from(schema.stimuli)
    .leftJoin(
      schema.questions,
      and(
        eq(schema.questions.stimulusId, schema.stimuli.id),
        eq(schema.questions.isArchived, false)
      )
    )
    .where(eq(schema.stimuli.courseId, courseId))
    .groupBy(schema.stimuli.id)
    .orderBy(asc(schema.stimuli.title), asc(schema.stimuli.ref));
}

export async function getStimulus(stimulusId: string) {
  return db.query.stimuli.findFirst({ where: eq(schema.stimuli.id, stimulusId) });
}

/** Compact list for pickers. */
export async function listStimulusOptions(courseId: string) {
  return db
    .select({
      id: schema.stimuli.id,
      kind: schema.stimuli.kind,
      title: schema.stimuli.title,
      ref: schema.stimuli.ref,
    })
    .from(schema.stimuli)
    .where(eq(schema.stimuli.courseId, courseId))
    .orderBy(asc(schema.stimuli.title), asc(schema.stimuli.ref));
}

export function stimulusLabel(s: {
  title: string | null;
  ref: string | null;
  kind: string;
}): string {
  return s.title || s.ref || `Untitled ${s.kind}`;
}
