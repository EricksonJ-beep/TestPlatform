import { Wordmark } from "@/components/brand/wordmark";

/** Calm, centered frame for login and signup. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Wordmark size="lg" />
        </div>
        {children}
      </div>
    </main>
  );
}
