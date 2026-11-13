"use client";

import { SectionError } from "@/components/section-error";

export default function TeacherError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError {...props} who="teacher" />;
}
