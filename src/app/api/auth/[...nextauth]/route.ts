import { handlers } from "@/auth";

// Auth.js owns these endpoints (sign-in, callback, session, csrf, sign-out).
export const { GET, POST } = handlers;
