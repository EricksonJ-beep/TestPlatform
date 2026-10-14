"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { homeTab, type HomeTab } from "@/lib/student-home";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LABEL: Record<HomeTab, string> = {
  assessments: "Assessments",
  practice: "Practice",
  results: "My results",
};

/**
 * The student home's tabs, kept in `?tab=` (Jon, Oct 14 2026, plan step 3): a to-do row can open
 * a tab with a link, and Back returns to the tab before. Switching pushes a history entry without
 * a server round trip (Next's router follows `history.pushState`).
 */
export function HomeTabs({ panels }: { panels: Record<HomeTab, ReactNode> }) {
  const params = useSearchParams();
  const tab = homeTab(params.get("tab"));

  function choose(value: unknown) {
    const next = homeTab(String(value));
    if (next === tab) return;
    const p = new URLSearchParams(params.toString());
    p.set("tab", next);
    window.history.pushState(null, "", `?${p.toString()}`);
  }

  return (
    <Tabs value={tab} onValueChange={choose} id="tabs" className="scroll-mt-16">
      <TabsList className="w-full justify-start sm:w-auto">
        {(Object.keys(LABEL) as HomeTab[]).map((t) => (
          <TabsTrigger key={t} value={t} data-tab={t}>
            {LABEL[t]}
          </TabsTrigger>
        ))}
      </TabsList>
      {(Object.keys(LABEL) as HomeTab[]).map((t) => (
        <TabsContent key={t} value={t}>
          {panels[t]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
