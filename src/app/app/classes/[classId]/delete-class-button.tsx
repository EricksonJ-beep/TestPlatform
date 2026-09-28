"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { deleteClass } from "../actions";

/** Two-step delete, like the assessment builder's: click the bin, then confirm. */
export function DeleteClassButton({ classId, students }: { classId: string; students: number }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [confirm, setConfirm] = useState(false);

  if (!confirm)
    return (
      <Button variant="ghost" onClick={() => setConfirm(true)} aria-label="Delete class">
        <Trash2 aria-hidden />
      </Button>
    );
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() => run(deleteClass(classId), () => router.push("/app/classes"))}
        >
          Delete class{students > 0 ? ` and unenroll ${students}` : ""}
        </Button>
        <Button variant="ghost" onClick={() => setConfirm(false)}>
          Keep
        </Button>
      </div>
      {error ? <p className="max-w-xs text-right text-xs text-error-foreground">{error}</p> : null}
    </div>
  );
}
