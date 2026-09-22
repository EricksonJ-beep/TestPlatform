"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/authz";

/**
 * Runs a `withAuthz` server action from a client component: tracks pending state,
 * surfaces the error and field errors, refreshes server data on success.
 */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const run = useCallback(
    <T,>(promise: Promise<ActionResult<T>>, onSuccess?: (data: T) => void) => {
      start(async () => {
        const r = await promise;
        if (r.ok) {
          setError(null);
          setFieldErrors({});
          onSuccess?.(r.data);
          router.refresh();
        } else {
          setError(r.error);
          setFieldErrors(r.fieldErrors ?? {});
        }
      });
    },
    [router]
  );

  const reset = useCallback(() => {
    setError(null);
    setFieldErrors({});
  }, []);

  return { run, pending, error, fieldErrors, reset };
}

export function FieldError({ errors, name }: { errors: Record<string, string[]>; name: string }) {
  const msg = errors[name]?.[0];
  return msg ? <p className="text-xs text-error-foreground">{msg}</p> : null;
}
