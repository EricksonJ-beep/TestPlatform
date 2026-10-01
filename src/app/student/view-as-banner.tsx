import { Eye } from "lucide-react";
import { stopViewAs } from "@/app/app/classes/actions";
import { Button } from "@/components/ui/button";

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
      className="flex flex-wrap items-center gap-3 bg-warning-soft px-4 py-2 text-sm text-warning-foreground md:px-6"
      data-view-as-banner
      role="status"
    >
      <span className="inline-flex items-center gap-2">
        <Eye className="size-4 shrink-0" aria-hidden />
        <span>
          <strong>Viewing as {studentName}.</strong> This is exactly what they see. Read-only:
          nothing you click here changes their work.
        </span>
      </span>
      <form action={stopViewAs} className="ml-auto">
        <Button size="sm" variant="outline" type="submit">
          Back to {teacherName.split(" ")[0]}&apos;s teacher view
        </Button>
      </form>
    </div>
  );
}
