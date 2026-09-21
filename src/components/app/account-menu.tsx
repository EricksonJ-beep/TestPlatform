"use client";

import { useRef } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
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
}: {
  firstName: string;
  lastName: string;
  email: string;
  logout: () => Promise<void>;
  compact?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <>
      <form ref={formRef} action={logout} className="hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md px-1.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
            "aria-expanded:bg-muted"
          )}
          aria-label="Account menu"
        >
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-brand-soft font-heading text-xs font-semibold text-brand-deep">
            {initialsOf(firstName, lastName)}
          </span>
          {compact ? null : (
            <span className="hidden max-w-40 truncate sm:inline">
              {firstName} {lastName}
            </span>
          )}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block font-medium">
              {firstName} {lastName}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => formRef.current?.requestSubmit()}>
            <LogOut aria-hidden />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
