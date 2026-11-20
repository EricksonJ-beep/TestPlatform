import { Eye } from "lucide-react";
import { stopViewAs } from "@/app/app/classes/actions";

/** Shown above the student shell while a teacher is "viewing as" a student. */
export function ViewAsBanner({
  studentName,
  teacherName,
}: {
  studentName: string;
  teacherName: string;
}) {
  return (
    <div
      className="bloom-shell flex flex-wrap items-center gap-3 bg-owed px-4 py-2 text-[15px] text-owed-text md:px-6"
      data-view-as-banner
      role="status"
    >
      <span className="inline-flex items-center gap-2 text-owed-text">
        <Eye className="size-4 shrink-0" aria-hidden />
        <span>
          <strong>Viewing as {studentName}.</strong> This is exactly what they see. Read-only:
          nothing you click here changes their work.
        </span>
      </span>
      <form action={stopViewAs} className="ml-auto">
        <button
          type="submit"
          className="inline-flex h-11 items-center rounded-[10px] border border-owed-text/40 bg-surface px-4 text-[15px] font-semibold text-ink hover:bg-owed"
        >
          Back to {teacherName.split(" ")[0]}&apos;s teacher view
        </button>
      </form>
    </div>
  );
}
