import Link from "next/link";
import { Search } from "lucide-react";
import { BLOOM_LABEL, BLOOM_LEVELS, IMPORTABLE_TYPES, TYPE_LABEL } from "@/lib/question-types";
import { Button } from "@/components/ui/button";

const selectClass =
  "border-input bg-card h-8 rounded-lg border px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Plain GET form: every filter is a URL param, so views are shareable and the back button works. */
export function Filters({
  bankId,
  targets,
  tags,
  current,
}: {
  bankId: string;
  targets: { id: string; code: string; title: string }[];
  tags: string[];
  current: {
    q?: string;
    type?: string;
    target?: string;
    difficulty?: number;
    bloom?: string;
    tag?: string;
  };
}) {
  const active = Object.values(current).some((v) => v !== undefined && v !== "");
  return (
    <form
      action={`/app/banks/${bankId}`}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3"
    >
      <label className="flex h-8 min-w-56 flex-1 items-center gap-2 rounded-md border border-border bg-background px-2 text-sm text-muted-foreground focus-within:border-brand">
        <Search className="size-4 shrink-0" aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={current.q ?? ""}
          placeholder="Search stems"
          aria-label="Search stems"
          className="w-full bg-transparent text-foreground outline-none"
        />
      </label>
      <select
        name="type"
        defaultValue={current.type ?? ""}
        aria-label="Type"
        className={selectClass}
      >
        <option value="">Any type</option>
        {IMPORTABLE_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      <select
        name="target"
        defaultValue={current.target ?? ""}
        aria-label="Learning target"
        className={selectClass}
      >
        <option value="">Any target</option>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.code} · {t.title}
          </option>
        ))}
      </select>
      <select
        name="difficulty"
        defaultValue={current.difficulty ?? ""}
        aria-label="Difficulty"
        className={selectClass}
      >
        <option value="">Any difficulty</option>
        {[1, 2, 3, 4, 5].map((d) => (
          <option key={d} value={d}>
            Difficulty {d}
          </option>
        ))}
      </select>
      <select
        name="bloom"
        defaultValue={current.bloom ?? ""}
        aria-label="Bloom's level"
        className={selectClass}
      >
        <option value="">Any Bloom&apos;s</option>
        {BLOOM_LEVELS.map((b) => (
          <option key={b} value={b}>
            {BLOOM_LABEL[b]}
          </option>
        ))}
      </select>
      {tags.length ? (
        <select
          name="tag"
          defaultValue={current.tag ?? ""}
          aria-label="Tag"
          className={selectClass}
        >
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      ) : null}
      <Button type="submit" variant="secondary" size="sm">
        Filter
      </Button>
      {active ? (
        <Link
          href={`/app/banks/${bankId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}
