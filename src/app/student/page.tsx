import { requireStudent } from "@/lib/authz";
import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

// Placeholder until Ticket 0.7 builds the student shell.
export default async function StudentHome() {
  const session = await requireStudent();
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl">Hi, {session.firstName}</h1>
      <p className="mt-2 text-muted-foreground">Student home arrives in Ticket 0.7.</p>
      <form action={logoutAction} className="mt-6">
        <Button variant="outline" type="submit">
          Log out
        </Button>
      </form>
    </main>
  );
}
