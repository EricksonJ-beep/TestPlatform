import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, KeyRound, Users } from "lucide-react";
import { requireTeacher } from "@/lib/authz";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

const links = [
  {
    href: "/app/courses",
    icon: BookOpen,
    title: "Courses",
    description: "Units, learning targets, and question pools for each course.",
  },
  {
    href: "/app/classes",
    icon: Users,
    title: "Classes",
    description: "Rosters, student accounts, and password resets.",
  },
] as const;

export default async function SettingsPage() {
  const session = await requireTeacher();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-2xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as {session.firstName} {session.lastName} · {session.email}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href} className="outline-none focus-visible:ring-3">
            <Card className="h-full transition-colors hover:border-brand/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="size-4 text-brand-deep" aria-hidden />
                  {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-brand-deep" aria-hidden />
              Password
            </CardTitle>
            <CardDescription>Change your password. Arrives in Ticket 1.18.</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      </div>
    </div>
  );
}
