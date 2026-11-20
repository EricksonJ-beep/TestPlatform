"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function initialsOf(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

/** Name + initials with a menu that holds the log-out action. */
export function AccountMenu({
  firstName,
  lastName,
  email,
  logout,
  compact = false,
  passwordHref,
}: {
  firstName: string;
  lastName: string;
  email: string | null;
  logout: () => Promise<void>;
  compact?: boolean;
  passwordHref?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <>
      <form ref={formRef} action={logout} className="hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1.5 text-[15px] font-medium text-ink hover:bg-stain-wash",
            "aria-expanded:bg-stain-wash"
          )}
          aria-label="Account menu"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-stain-tint text-xs font-bold text-stain-deep">
            {initialsOf(firstName, lastName)}
          </span>
          {compact ? null : (
            <span className="hidden max-w-40 truncate sm:inline">
              {firstName} {lastName}
            </span>
          )}
          <ChevronDown className="size-4 text-ink-muted" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <span className="block font-medium">
                {firstName} {lastName}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{email}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {passwordHref ? (
            <DropdownMenuItem nativeButton={false} render={<Link href={passwordHref} />}>
              <KeyRound aria-hidden />
              Change password
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => formRef.current?.requestSubmit()}>
            <LogOut aria-hidden />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
