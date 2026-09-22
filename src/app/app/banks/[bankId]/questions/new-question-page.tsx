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

export function EditQuestionPage(props: Omit<EditorProps, "onSaved" | "onCancel">) {
  const router = useRouter();
  return (
    <QuestionEditor
      {...props}
      onSaved={(id) => router.push(`/app/banks/${props.bankId}/questions/${id}`)}
      onCancel={() => router.push(`/app/banks/${props.bankId}`)}
    />
  );
}
