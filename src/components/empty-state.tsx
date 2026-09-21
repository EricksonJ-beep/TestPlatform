import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

/** Friendly empty state: an icon, one line of what this is, one line of what to do. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-10 text-center",
        className
      )}
    >
      {Icon ? (
        <span className="mb-1 inline-flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand-deep">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
