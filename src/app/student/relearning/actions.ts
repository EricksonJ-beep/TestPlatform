"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ActionError,
  requireAssignmentAccess,
  requireRelearningRowAccess,
  withAuthz,
} from "@/lib/authz";
import {
  answerRelearningCheck as answerCheck,
  flagRelearningVideo as flagVideo,
  markRelearningSection as markSection,
  RelearningError,
  saveRelearningShortAnswer as saveShortAnswer,
  setQuizTargetAdded,
  startRelearning as start,
} from "@/lib/relearning-server";

/** Run a relearning step and turn its refusals into what the student sees. */
async function refusing<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof RelearningError) throw new ActionError(err.message, err.status);
    throw err;
  }
}

function revalidate(assignmentId: string) {
  revalidatePath("/student");
  revalidatePath(`/student/assignments/${assignmentId}`);
  revalidatePath(`/student/relearning/${assignmentId}`);
  revalidatePath(`/app/results/${assignmentId}`);
}

const uuid = z.string().uuid();
const modeSchema = z.enum(["read", "watch", "do"]);

/**
 * Start relearning in Read, Watch or Do, or switch an unfinished one (A4). A quiz may add its 80%+
 * targets as it starts (Q2); a test names the required target (S2). Students only.
 */
export const startRelearning = withAuthz(
  async (
    assignmentId: string,
    mode: "read" | "watch" | "do",
    opts: { targetId?: string | null; add?: string[] } = {}
  ) => {
    const access = await requireAssignmentAccess(assignmentId);
    if (access.as !== "student") throw new ActionError("Students only.", 403);
    const parsed = z
      .object({
        mode: modeSchema,
        targetId: uuid.nullable().optional(),
        add: z.array(uuid).max(10).optional(),
      })
      .safeParse({ mode, ...opts });
    if (!parsed.success) throw new ActionError("Pick Read, Watch or Do.", 400);
    const r = await refusing(() =>
      start({ assignmentId, studentId: access.userId, ...parsed.data })
    );
    revalidate(assignmentId);
    return r;
  }
);

/** Quiz (Q2): fold an 80%+ target into the relearning already started, or take it back out. */
export const setRelearningTargetAdded = withAuthz(
  async (assignmentId: string, learningTargetId: string, added: boolean) => {
    const access = await requireAssignmentAccess(assignmentId);
    if (access.as !== "student") throw new ActionError("Students only.", 403);
    if (!uuid.safeParse(learningTargetId).success)
      throw new ActionError("That target isn't on this quiz.", 400);
    const r = await refusing(() =>
      setQuizTargetAdded({
        assignmentId,
        studentId: access.userId,
        targetId: learningTargetId,
        added: !!added,
      })
    );
    revalidate(assignmentId);
    return r;
  }
);

/** A row the student is working through: their own (the guard), and only students write progress. */
function studentRow(access: Awaited<ReturnType<typeof requireRelearningRowAccess>>) {
  if (access.as !== "student") throw new ActionError("Students only.", 403);
  return access.row;
}

/** A quick check (A3): graded on the server, unlimited tries. */
export const answerRelearningCheck = withAuthz(
  async (rowId: string, sectionId: string, checkId: string, answer: string) => {
    const row = studentRow(await requireRelearningRowAccess(rowId));
    if (!uuid.safeParse(sectionId).success) throw new ActionError("Not found.", 404);
    const r = await refusing(() =>
      answerCheck(row, sectionId, String(checkId).slice(0, 100), String(answer ?? "").slice(0, 500))
    );
    if (r.rowFinished) revalidate(row.assignmentId);
    return r;
  }
);

/** A section's own part (A3): read to the end, the video's watched share, a Do part gone through. */
export const markRelearningSection = withAuthz(
  async (
    rowId: string,
    sectionId: string,
    patch: { scrolledToEnd?: boolean; watchPercent?: number; completed?: boolean }
  ) => {
    const row = studentRow(await requireRelearningRowAccess(rowId));
    if (!uuid.safeParse(sectionId).success) throw new ActionError("Not found.", 404);
    const parsed = z
      .object({
        scrolledToEnd: z.boolean().optional(),
        watchPercent: z.number().min(0).max(100).optional(),
        completed: z.boolean().optional(),
      })
      .safeParse(patch ?? {});
    if (!parsed.success) throw new ActionError("Nothing to save for this part.", 400);
    const r = await refusing(() => markSection(row, sectionId, parsed.data));
    if (r.rowFinished) revalidate(row.assignmentId);
    return r;
  }
);

/** The extension's short answer (decision 7). */
export const saveRelearningShortAnswer = withAuthz(
  async (rowId: string, sectionId: string, text: string) => {
    const row = studentRow(await requireRelearningRowAccess(rowId));
    if (!uuid.safeParse(sectionId).success) throw new ActionError("Not found.", 404);
    const r = await refusing(() => saveShortAnswer(row, sectionId, String(text ?? "")));
    if (r.rowFinished) revalidate(row.assignmentId);
    return r;
  }
);

/** A6: the video wouldn't play here; the teacher sees it in Needs you. */
export const flagRelearningVideo = withAuthz(
  async (rowId: string, sectionId: string, errorCode: string | null) => {
    const row = studentRow(await requireRelearningRowAccess(rowId));
    if (!uuid.safeParse(sectionId).success) throw new ActionError("Not found.", 404);
    await refusing(() => flagVideo(row, sectionId, errorCode === null ? null : String(errorCode)));
    revalidatePath("/app");
    return { flagged: true };
  }
);
