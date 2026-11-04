"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startPracticeCheck } from "./actions";

/**
 * Opens the practice check the relearning path asks for (R3) and goes to it: the one after a
 * relearning bundle, or the fresh one before the next attempt. The step path's Next step box (R5)
 * uses it too.
 */
export function StartCheckButton({
  assignmentId,
  kind,
  bundleId,
  label = "Start practice check",
  primary = true,
}: {
  assignmentId: string;
  kind: "path" | "attempt";
  bundleId: string | null;
  label?: string;
  primary?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    const r = await startPracticeCheck(assignmentId, kind, bundleId);
    if (!r.ok) {
      setBusy(false);
      setError(r.error);
      return;
    }
    router.push(`/student/checks/${r.data.checkId}`);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        size="lg"
        variant={primary ? "default" : "outline"}
        onClick={() => void go()}
        disabled={busy}
        data-start-check
      >
        <ClipboardCheck data-icon="inline-start" aria-hidden />
        {busy ? "Opening…" : label}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-error-foreground">
          {error}
        </span>
      ) : null}
    </span>
  );
}
