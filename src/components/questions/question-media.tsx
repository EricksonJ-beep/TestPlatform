/**
 * A question's picture and video, the same on every screen that shows a question (hardening
 * plan H6.1 and H6.6, Nov 9 2026). Each runner had its own copy, so the picture never had a
 * description for screen readers, and corrections and the practice check left the video out.
 *
 * `alt` is what the teacher typed under "Describe this image". Without one the picture is
 * announced as "Image for this question" rather than skipped, because a question that says
 * "label this diagram" makes no sense if the diagram is silent.
 */
export function QuestionMedia({
  mediaUrl,
  mediaAlt,
  videoUrl,
  imageClassName = "max-h-96 max-w-full rounded-md bg-white",
}: {
  mediaUrl?: string | null;
  mediaAlt?: string | null;
  videoUrl?: string | null;
  imageClassName?: string;
}) {
  return (
    <>
      {mediaUrl ? (
        <div className="mt-3 rounded-lg bg-brand-soft p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt={mediaAlt?.trim() || "Image for this question"}
            className={imageClassName}
          />
        </div>
      ) : null}
      {videoUrl ? (
        <div className="mt-3 rounded-lg bg-brand-soft p-3">
          {/youtube\.com|youtu\.be/.test(videoUrl) ? (
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-brand-deep hover:underline"
            >
              Watch the video
            </a>
          ) : (
            <video src={videoUrl} controls className="w-full max-w-xl rounded-md bg-black" />
          )}
        </div>
      ) : null}
    </>
  );
}
