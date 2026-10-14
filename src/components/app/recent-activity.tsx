import Link from "next/link";
import { cn } from "cn";
import type { ActivityRow } from "@/lib/activity-log";
import {
  FEED_GROUP_LABEL,
  FEED_GROUPS,
  feedHref,
  toggleKind,
  type FeedFilter,
} from "@/lib/activity-filter";
import { ActivityFeed } from "@/components/app/activity-feed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Recent activity on the Dashboard (Jon, Oct 13 2026, dashboard plan decision 10: "kept, with
 * filters (this class | all classes; by kind; logins off by default)"). The filters live in the
 * page's address, so the live refresh and a reload keep them: This class (the gradebook's class:
 * its own tests plus its students' logins and practice) or All classes, kind chips (none pressed =
 * every kind), Logins (off by default) and Show 3 days.
 */
export function RecentActivity({
  rows,
  filter,
  hasClass,
  classId,
  classLabel,
}: {
  rows: ActivityRow[];
  filter: FeedFilter;
  hasClass: boolean;
  classId: string | null;
  classLabel: string | null;
}) {
  const href = (f: FeedFilter) => feedHref(f, hasClass);
  const span = filter.days === 3 ? "the last 3 days" : "the last 24 hours";
  const narrowed = filter.kinds.length > 0;
  return (
    <Card data-recent-activity id="recent-activity">
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <p className="text-sm text-muted-foreground">
          What your students did in {span}
          {filter.scope === "class" && classLabel
            ? ` in ${classLabel}`
            : " across your classes"}.{" "}
          {filter.scope === "class" && classId ? (
            <Link href={`/app/classes/${classId}/activity`} className="hover:underline">
              Full log
            </Link>
          ) : (
            "Each class page has the full log."
          )}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs" data-feed-filters>
          {hasClass ? (
            <span className="mr-1 inline-flex rounded-md border border-border p-0.5">
              <Chip href={href({ ...filter, scope: "class" })} on={filter.scope === "class"} plain>
                This class
              </Chip>
              <Chip href={href({ ...filter, scope: "all" })} on={filter.scope === "all"} plain>
                All classes
              </Chip>
            </span>
          ) : null}
          <Chip href={href({ ...filter, kinds: [] })} on={!narrowed} data="all">
            All kinds
          </Chip>
          {FEED_GROUPS.map((g) => (
            <Chip key={g} href={href(toggleKind(filter, g))} on={filter.kinds.includes(g)} data={g}>
              {FEED_GROUP_LABEL[g]}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <Chip href={href({ ...filter, logins: !filter.logins })} on={filter.logins} data="logins">
            Logins
          </Chip>
          <Chip
            href={href({ ...filter, days: filter.days === 3 ? 1 : 3 })}
            on={filter.days === 3}
            data="days"
          >
            Show 3 days
          </Chip>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[32rem] overflow-y-auto [&_section]:rounded-none [&_section]:border-0">
          <ActivityFeed
            rows={rows}
            showPlace={filter.scope === "all"}
            groupByDay={filter.days === 3}
            emptyText={
              narrowed || filter.logins
                ? `Nothing like that in ${span}.`
                : `Nothing logged in ${span}.`
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Chip({
  href,
  on,
  plain = false,
  data,
  children,
}: {
  href: string;
  on: boolean;
  plain?: boolean;
  data?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      replace
      aria-current={on ? "true" : undefined}
      data-feed-chip={data}
      className={cn(
        "rounded-md px-2 py-0.5 font-medium transition-colors",
        plain
          ? on
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground"
          : on
            ? "border border-brand bg-brand-soft text-brand-deep"
            : "border border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
