"use server";

import { revalidatePath } from "next/cache";
import { ActionError, isUuid, requireOwner, withAuthz } from "@/lib/authz";
import { rememberCourse } from "@/lib/current-course";
import { getEditorOption, getEditorTarget } from "@/lib/queries/relearning-options";
import { MODES, type RelearningMode } from "@/lib/relearning";
import { readEditorInput } from "@/lib/relearning-editor";
import { writeRelearningOption } from "@/lib/relearning-write";

/**
 * The teacher's Read · Watch · Do editor (Nov 5 2026). Both actions check ownership first, then
 * rebuild and validate what the browser sent (`readEditorInput`: the pack checks
 * `relearningIssues` plus the editor's own) before anything is written. Sections update in place
 * by part + order, exactly as a content pack does, so students partway through keep their
 * progress; `edited_at` marks the option so a later pack revision keeps these edits.
 */

function refuse(issues: string[]): never {
  const more = issues.length > 1 ? ` (and ${issues.length - 1} more)` : "";
  throw new ActionError(`${capital(issues[0])}${more}`, 400, { option: issues });
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function revalidate(optionId: string) {
  revalidatePath("/app/practice/relearning");
  revalidatePath(`/app/practice/relearning/${optionId}`);
  revalidatePath("/student");
}

// Rule: a new option goes on a target of a course the teacher owns.
export const createRelearningOption = withAuthz(
  async (courseId: string, targetId: string, mode: RelearningMode, input: unknown) => {
    const session = await requireOwner({ type: "course", id: courseId });
    if (!isUuid(targetId)) throw new ActionError("That target doesn't exist.", 404);
    const target = await getEditorTarget(targetId);
    if (!target || target.courseId !== courseId)
      throw new ActionError("That target isn't on this course.", 404);
    if (!MODES.includes(mode)) throw new ActionError("Pick Read, Watch or Do.", 400);
    const { pack, issues } = readEditorInput(input, target.code, mode);
    if (!pack) refuse(issues);
    const { optionId } = await writeRelearningOption({
      ownerId: session.userId,
      targetId,
      option: pack,
      editedAt: new Date(),
    });
    await rememberCourse(courseId);
    revalidate(optionId);
    return { optionId };
  }
);

// Rule: only the option's owner may change it; its target and mode stay as they are.
export const updateRelearningOption = withAuthz(async (optionId: string, input: unknown) => {
  const session = await requireOwner({ type: "relearning_option", id: optionId });
  const option = await getEditorOption(optionId);
  if (!option) throw new ActionError("That option doesn't exist.", 404);
  const { pack, issues } = readEditorInput(input, option.target.code, option.mode);
  if (!pack) refuse(issues);
  await writeRelearningOption({
    ownerId: session.userId,
    targetId: option.target.id,
    option: pack,
    editedAt: new Date(),
  });
  revalidate(optionId);
  return { optionId };
});
