import type { Instrumentation } from "next";
import { errorLogLine } from "@/lib/error-log";

/**
 * Every error the server catches is written as one line that Vercel's log search can find by
 * the reference shown on the error page (hardening plan H7.2). An error service (H7.3) would
 * be called from here too.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  console.error(errorLogLine(err, request, context));
};
