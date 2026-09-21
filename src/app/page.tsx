import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { homeFor } from "@/lib/routes";

/** The root just sends people where they belong. */
export default async function RootPage() {
  const session = await getCurrentSession();
  redirect(session ? homeFor(session.role) : "/login");
}
