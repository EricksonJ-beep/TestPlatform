import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireContentAccess } from "@/lib/authz";
import { listBanksForCourse, listPoolsForBuilder } from "@/lib/queries/assessments";
import { listTargets } from "@/lib/queries/courses";
import { getPracticeSetDetail } from "@/lib/queries/practice";
import { SetEditor } from "./set-editor";

export const metadata: Metadata = { title: "Practice set" };

export default async function PracticeSetPage({ params }: PageProps<"/app/practice/sets/[setId]">) {
  const { setId } = await params;
  let access;
  try {
    access = await requireContentAccess({ type: "practice_set", id: setId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  if (access.as !== "teacher") notFound();
  const detail = await getPracticeSetDetail(setId);
  if (!detail) notFound();
  const [targets, pools, banks] = await Promise.all([
    detail.courseId ? listTargets(detail.courseId) : Promise.resolve([]),
    detail.courseId ? listPoolsForBuilder(detail.courseId) : Promise.resolve([]),
    detail.courseId ? listBanksForCourse(access.userId, detail.courseId) : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Link
        href="/app/practice"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> Practice sets
      </Link>
      <SetEditor
        detail={detail}
        targets={targets.map((t) => ({ id: t.id, code: t.code, title: t.title }))}
        pools={pools.map((p) => ({ id: p.id, name: p.name, size: p.size }))}
        banks={banks}
      />
    </div>
  );
}
