/**
 * Authentication routes: register, login, logout, and /me.
 */

import type { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";
import { lucia } from "../auth/lucia.js";
import { requireAuth } from "../auth/middleware.js";
import { db } from "../db.js";

// ─── Validation schemas ───────────────────────────────────────────────────────

const RegisterBodySchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username may only contain letters, numbers, _ and -"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const LoginBodySchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /api/auth/register ───────────────────────────────────────────────
  fastify.post("/auth/register", async (request, reply) => {
    const parseResult = RegisterBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation error",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { username, email, password } = parseResult.data;

    // Check for existing username / email
    const existing = await db.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });

    if (existing) {
      const field = existing.email === email ? "email" : "username";
      return reply.status(409).send({ error: `${field} is already taken` });
    }

    // Hash password with cost factor 12
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await db.user.create({
      data: { username, email, passwordHash },
    });

    // Create session
    const session = await lucia.createSession(user.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);

    void reply.header("Set-Cookie", sessionCookie.serialize());

    return reply.status(201).send({
      user: { id: user.id, username: user.username, email: user.email },
    });
  });

  // ── POST /api/auth/login ──────────────────────────────────────────────────
  fastify.post("/auth/login", async (request, reply) => {
    const parseResult = LoginBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation error",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { email, password } = parseResult.data;

    const user = await db.user.findUnique({ where: { email } });

    if (!user) {
      // Use constant-time comparison via bcrypt even on non-existent users
      await bcrypt.compare(password, "$2b$12$invalidHashToPreventTimingAttacks");
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const session = await lucia.createSession(user.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);

    void reply.header("Set-Cookie", sessionCookie.serialize());

    return reply.send({
      user: { id: user.id, username: user.username, email: user.email },
    });
  });

  // ── POST /api/auth/logout ─────────────────────────────────────────────────
  fastify.post(
    "/auth/logout",
    { preHandler: requireAuth },
    async (request, reply) => {
      await lucia.invalidateSession(request.session.id);
      const blankCookie = lucia.createBlankSessionCookie();
      void reply.header("Set-Cookie", blankCookie.serialize());
      return reply.send({ success: true });
    },
  );

  // ── GET /api/auth/me ──────────────────────────────────────────────────────
  fastify.get(
    "/auth/me",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { user } = request;
      return reply.send({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      });
    },
  );
}
