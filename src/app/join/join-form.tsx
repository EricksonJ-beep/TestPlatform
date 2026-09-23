"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinClass, lookupJoinCode, type JoinLookup, type JoinState } from "./actions";

/** Step 1: code. Step 2: pick a name (or type it) and a password. */
export function JoinForm({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [lookup, setLookup] = useState<JoinLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, startLookup] = useTransition();
  const [nameId, setNameId] = useState("");
  const [notListed, setNotListed] = useState(false);
  const [state, action, pending] = useActionState<JoinState, FormData>(joinClass, null);
  const fe = state?.fieldErrors ?? {};

  function find() {
    startLookup(async () => {
      const r = await lookupJoinCode(code);
      if (r.ok) {
        setLookup(r.data);
        setLookupError(null);
        setNotListed(r.data.names.length === 0);
      } else {
        setLookup(null);
        setLookupError(r.error);
      }
    });
  }

  if (!lookup) {
    return (
      <form
        className="mt-5 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          find();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="join-code">Class code</Label>
          <Input
            id="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="BIO3-K7QX"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-12 font-mono text-lg tracking-widest"
            required
            autoFocus
          />
          {lookupError ? (
            <p role="alert" className="text-sm text-error-foreground">
              {lookupError}
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg" disabled={looking || code.trim().length < 4}>
          {looking ? "Looking…" : "Find my class"}
        </Button>
      </form>
    );
  }

  return (
    <form action={action} className="mt-5 grid gap-4" noValidate>
      <input type="hidden" name="code" value={code} />
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <p className="font-medium">{lookup.className}</p>
        <p className="text-muted-foreground">
          {lookup.courseName ? `${lookup.courseName} · ` : ""}
          {lookup.teacherName}
        </p>
        <button
          type="button"
          className="mt-1 text-xs text-brand-deep hover:underline"
          onClick={() => setLookup(null)}
        >
          Not your class? Change the code
        </button>
      </div>

      {!notListed ? (
        <div className="grid gap-1.5">
          <Label htmlFor="join-name">Your name</Label>
          <select
            id="join-name"
            name="nameId"
            value={nameId}
            onChange={(e) => setNameId(e.target.value)}
            className="h-11 rounded-lg border border-input bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            required
          >
            <option value="">Pick your name…</option>
            {lookup.names.map((n) => (
              <option key={n.id} value={n.id}>
                {n.lastName}, {n.firstName}
              </option>
            ))}
          </select>
          {fe.nameId ? <p className="text-xs text-error-foreground">{fe.nameId}</p> : null}
          <button
            type="button"
            className="justify-self-start text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setNotListed(true);
              setNameId("");
            }}
          >
            My name isn&apos;t listed
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="join-first">First name</Label>
              <Input id="join-first" name="firstName" autoComplete="given-name" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="join-last">Last name</Label>
              <Input id="join-last" name="lastName" autoComplete="family-name" required />
            </div>
          </div>
          {fe.nameId ? <p className="text-xs text-error-foreground">{fe.nameId}</p> : null}
          {lookup.names.length > 0 ? (
            <button
              type="button"
              className="justify-self-start text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setNotListed(false)}
            >
              Back to the list
            </button>
          ) : null}
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="join-password">Choose a password</Label>
        <Input
          id="join-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={fe.password ? true : undefined}
        />
        <p className="text-xs text-muted-foreground">
          At least 8 characters. Write it down somewhere safe.
        </p>
        {fe.password ? <p className="text-xs text-error-foreground">{fe.password}</p> : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="join-confirm">Type it again</Label>
        <Input
          id="join-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={fe.confirm ? true : undefined}
        />
        {fe.confirm ? <p className="text-xs text-error-foreground">{fe.confirm}</p> : null}
      </div>
      {state?.error ? (
        <p
          role="alert"
          className="rounded-md bg-error-soft px-3 py-2 text-sm leading-snug text-error-foreground"
        >
          {state.error}
          {state.created ? ` Your username is ${state.created.username}.` : ""}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Joining…" : "Join class"}
      </Button>
    </form>
  );
}
