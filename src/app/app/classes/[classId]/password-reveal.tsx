"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shows a one-time password in large type with a copy button. */
export function PasswordReveal({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${email}\t${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the text is still visible */
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg bg-brand-soft p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-brand-deep">{email}</p>
        <p className="font-mono text-2xl font-semibold tracking-wide">{password}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={copy} aria-live="polite">
        {copied ? (
          <Check data-icon="inline-start" aria-hidden />
        ) : (
          <Copy data-icon="inline-start" aria-hidden />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
