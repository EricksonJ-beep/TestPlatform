import { Sparkles } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

/** Placeholder for teacher areas that Phase 1 builds. */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl">{title}</h1>
      <div className="mt-6 rounded-lg border border-border bg-card">
        <EmptyState icon={Sparkles} title="Coming in Phase 1" description={description} />
      </div>
    </div>
  );
}
