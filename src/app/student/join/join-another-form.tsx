"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { joinAnotherClass } from "@/app/join/actions";

export function JoinAnotherForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const { run, pending, error } = useAction();
  return (
    <form
      className="grid gap-4 rounded-lg border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(joinAnotherClass(code), () => router.push("/student"));
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="sj-code">Class code</Label>
        <Input
          id="sj-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="BIO3-K7QX"
          autoCapitalize="characters"
          autoComplete="off"
          className="h-12 font-mono text-lg tracking-widest"
          required
          autoFocus
        />
        {error ? (
          <p role="alert" className="text-sm text-error-foreground">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" disabled={pending || code.trim().length < 4}>
        Join
      </Button>
    </form>
  );
}
