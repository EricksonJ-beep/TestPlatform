import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireShared } from "@/lib/authz";
import { nominalPoints } from "@/lib/assessments/serve";
import {
  getAssessmentDetail,
  listBanksForCourse,
  listPoolsForBuilder,
  loadBuilderSections,
} from "@/lib/queries/assessments";
import { listTargets } from "@/lib/queries/courses";
import { Builder } from "./builder";

export const metadata: Metadata = { title: "Assessment builder" };

export default async function AssessmentPage({
  params,
}: PageProps<"/app/assessments/[assessmentId]">) {
  const { assessmentId } = await params;
  let access;
  try {
    access = await requireShared({ type: "assessment", id: assessmentId }, "view");
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const detail = await getAssessmentDetail(assessmentId);
  if (!detail) notFound();
  const [targets, pools, banks, builderSections] = await Promise.all([
    detail.courseId ? listTargets(detail.courseId) : Promise.resolve([]),
    detail.courseId ? listPoolsForBuilder(detail.courseId) : Promise.resolve([]),
    detail.courseId ? listBanksForCourse(access.userId, detail.courseId) : Promise.resolve([]),
    loadBuilderSections(assessmentId),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Link
        href="/app/assessments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> Assessments
      </Link>
      <Builder
        detail={detail}
        access={access.access}
        targets={targets.map((t) => ({ id: t.id, code: t.code, title: t.title }))}
        pools={pools}
        banks={banks}
        totalPoints={nominalPoints(builderSections)}
      />
    </div>
  );
}
