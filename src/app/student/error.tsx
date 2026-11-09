"use client";

import { SectionError } from "@/components/section-error";

export default function StudentError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError {...props} who="student" />;
}
