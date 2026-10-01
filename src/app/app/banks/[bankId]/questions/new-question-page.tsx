"use client";

import { useRouter } from "next/navigation";
import { QuestionEditor, type EditorProps } from "./question-editor";

/** Full-page wrapper: after saving, go back to the bank. */
export function NewQuestionPage(props: Omit<EditorProps, "onSaved" | "onCancel" | "question">) {
  const router = useRouter();
  return (
    <QuestionEditor
      {...props}
      onSaved={() => router.push(`/app/banks/${props.bankId}`)}
      onCancel={() => router.push(`/app/banks/${props.bankId}`)}
    />
  );
}

export function EditQuestionPage({
  backHref,
  ...props
}: Omit<EditorProps, "onSaved" | "onCancel"> & {
  /** Where Save and Cancel return to when the editor was opened from elsewhere (a results page). */
  backHref?: string;
}) {
  const router = useRouter();
  return (
    <QuestionEditor
      {...props}
      onSaved={(id) => router.push(backHref ?? `/app/banks/${props.bankId}/questions/${id}`)}
      onCancel={() => router.push(backHref ?? `/app/banks/${props.bankId}`)}
    />
  );
}
