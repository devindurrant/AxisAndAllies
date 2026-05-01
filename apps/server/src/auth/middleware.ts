/**
 * Fastify authentication middleware.
 *
 * Provides a `requireAuth` preHandler hook that reads the session cookie,
 * validates it via Lucia, and attaches the user + session to the request.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { User, Session } from "lucia";
import { lucia } from "./lucia.js";

// ─── Request augmentation ─────────────────────────────────────────────────────

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Authenticated Lucia user. Only set after `requireAuth` has run.
     * Accessing this before authentication is a programming error.
     */
    user: User;
    /**
     * Active Lucia session. Only set after `requireAuth` has run.
     */
    session: Session;
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Fastify preHandler hook that enforces authentication.
 *
 * Reads the `aa_session` cookie, validates it with Lucia, and attaches
 * `request.user` and `request.session`.  Returns HTTP 401 if not authenticated.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const sessionId = request.cookies["aa_session"];

  if (!sessionId) {
    return reply.status(401).send({ error: "Not authenticated" });
  }

  const { session, user } = await lucia.validateSession(sessionId);

  if (!session || !user) {
    // Clear stale cookie
    const sessionCookieBlank = lucia.createBlankSessionCookie();
    void reply.header("Set-Cookie", sessionCookieBlank.serialize());
    return reply.status(401).send({ error: "Session expired or invalid" });
  }

  // Refresh cookie if session was extended
  if (session.fresh) {
    const refreshedCookie = lucia.createSessionCookie(session.id);
    void reply.header("Set-Cookie", refreshedCookie.serialize());
  }

  request.user = user;
  request.session = session;
}
