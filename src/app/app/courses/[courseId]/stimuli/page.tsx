import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { isAuthzError, requireOwner } from "@/lib/authz";
import { getCourseDetail } from "@/lib/queries/courses";
import { listStimuli } from "@/lib/queries/stimuli";
import { isStorageConfigured } from "@/lib/storage";
import { StimuliManager } from "./stimuli-manager";

export const metadata: Metadata = { title: "Stimuli" };

export default async function StimuliPage({
  params,
}: PageProps<"/app/courses/[courseId]/stimuli">) {
  const { courseId } = await params;
  try {
    await requireOwner({ type: "course", id: courseId });
  } catch (err) {
    if (isAuthzError(err)) notFound();
    throw err;
  }
  const course = await getCourseDetail(courseId);
  if (!course) notFound();
  const stimuli = await listStimuli(courseId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <Link
          href={`/app/courses/${course.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden /> {course.name}
        </Link>
        <h1 className="mt-2 text-2xl">Shared stimuli</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          A passage, graph, video, or audio clip attached once to a group of questions. In a test it
          renders once with its questions beneath, and a pool can draw the whole group together.
        </p>
      </div>
      <StimuliManager
        courseId={course.id}
        stimuli={stimuli}
        storageConfigured={isStorageConfigured()}
      />
    </div>
  );
}
