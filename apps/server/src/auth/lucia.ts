/**
 * Lucia v3 authentication setup using the Prisma adapter.
 */

import { Lucia } from "lucia";
import { PrismaAdapter } from "@lucia-auth/adapter-prisma";
import { db } from "../db.js";

// ─── Adapter ─────────────────────────────────────────────────────────────────

const adapter = new PrismaAdapter(db.session, db.user);

// ─── Lucia instance ───────────────────────────────────────────────────────────

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    name: "aa_session",
    attributes: {
      secure: process.env["COOKIE_SECURE"] === "true",
      sameSite: "lax",
    },
  },
  getUserAttributes(attributes) {
    return {
      email: attributes.email,
      username: attributes.username,
    };
  },
});

// ─── TypeScript module augmentation ──────────────────────────────────────────

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: DatabaseUserAttributes;
  }
}

export interface DatabaseUserAttributes {
  email: string;
  username: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Validate a session ID string and return the session + user, or null values
 * if the session does not exist or has expired.
 */
export async function validateSession(sessionId: string): Promise<{
  session: import("lucia").Session | null;
  user: import("lucia").User | null;
}> {
  const result = await lucia.validateSession(sessionId);
  return result;
}
