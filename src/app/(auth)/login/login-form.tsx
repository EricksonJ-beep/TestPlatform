"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type AuthFormState } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(loginAction, null);
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="mt-5 grid gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder="you@cadott.k12.wi.us"
          required
          aria-invalid={fe.email ? true : undefined}
        />
        {fe.email ? <p className="text-xs text-error-foreground">{fe.email}</p> : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={fe.password ? true : undefined}
        />
        {fe.password ? <p className="text-xs text-error-foreground">{fe.password}</p> : null}
      </div>
      {state?.error ? (
        <p
          role="alert"
          className="rounded-md bg-error-soft px-3 py-2 text-sm leading-snug text-error-foreground"
        >
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
