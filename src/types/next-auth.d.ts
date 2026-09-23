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
  }
}
