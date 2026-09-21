import Link from "next/link";
import { cn } from "cn";

/** Dashboard metric tile. `attention` tints the number coral when it needs the teacher. */
export function MetricCard({
  label,
  value,
  hint,
  href,
  attention = false,
}: {
  label: string;
  value: number;
  hint?: string;
  href?: string;
  attention?: boolean;
}) {
  const body = (
    <>
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-heading text-3xl leading-none font-semibold tabular",
          attention && value > 0 ? "text-coral-deep" : "text-foreground"
        )}
      >
        {value.toLocaleString()}
      </span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </>
  );
  const className = cn(
    "bg-card flex flex-col gap-1.5 rounded-lg border px-4 py-4",
    attention && value > 0 ? "border-[#F5C6BC]" : "border-border",
    href && "hover:border-brand/40 transition-colors"
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
