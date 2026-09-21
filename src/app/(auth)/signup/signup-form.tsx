"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction, type AuthFormState } from "../actions";

function Field({
  id,
  label,
  error,
  ...props
}: React.ComponentProps<typeof Input> & { id: string; label: string; error?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} aria-invalid={error ? true : undefined} {...props} />
      {error ? <p className="text-xs text-error-foreground">{error}</p> : null}
    </div>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signupAction, null);
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="mt-5 grid gap-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field id="firstName" label="First name" autoComplete="given-name" error={fe.firstName} />
        <Field id="lastName" label="Last name" autoComplete="family-name" error={fe.lastName} />
      </div>
      <Field
        id="email"
        label="School email"
        type="email"
        autoComplete="username"
        placeholder="you@cadott.k12.wi.us"
        error={fe.email}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        error={fe.password}
      />
      <Field
        id="inviteCode"
        label="Invite code"
        autoComplete="off"
        placeholder="BLOOM-…"
        error={fe.inviteCode}
      />
      {state?.error ? (
        <p
          role="alert"
          className="rounded-md bg-error-soft px-3 py-2 text-sm text-error-foreground"
        >
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
