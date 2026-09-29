import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/** Any missing page, or a page that belongs to someone else (guards answer 404 for both). */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-lg items-center px-4 py-16">
      <div className="w-full rounded-lg border border-border bg-card">
        <EmptyState
          icon={Compass}
          title="That page isn't here"
          description="It may have been removed, or it may belong to someone else. Head back home and try from there."
          action={
            <Button nativeButton={false} render={<Link href="/" />}>
              Go home
            </Button>
          }
        />
      </div>
    </main>
  );
}
