import type { UserRole } from "@/db/types";

declare module "next-auth" {
  interface User {
    role: UserRole;
    firstName: string;
    lastName: string;
    username?: string | null;
  }
  interface Session {
    user: {
      id: string;
      email: string | null;
      username: string | null;
      name?: string | null;
      role: UserRole;
      firstName: string;
      lastName: string;
      /** When this session began (ms); 0 for sessions from before Nov 9 2026. */
      issuedAt: number;
    };
  }
}

// Auth.js v5 re-exports the JWT type from @auth/core, so that is the module to augment.
declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    role: UserRole;
    firstName: string;
    lastName: string;
    username?: string | null;
    /** When the user signed in (ms). A password change after it ends the session (H4.2). */
    issuedAt?: number;
  }
}
