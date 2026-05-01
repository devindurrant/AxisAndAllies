/**
 * Axis & Allies server entry point.
 *
 * Startup sequence:
 *  1. Create Fastify, register plugins and routes.
 *  2. Call fastify.ready() to initialize without listening.
 *  3. Attach Socket.io to fastify.server (same http.Server Fastify owns).
 *  4. Register socket event handlers.
 *  5. Call fastify.listen() — now both HTTP and WebSocket share one port.
 */

import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import { Server as SocketServer } from "socket.io";
import { config } from "./config.js";
import { lucia } from "./auth/lucia.js";
import { authRoutes } from "./routes/auth.js";
import { gameRoutes } from "./routes/games.js";
import { purchaseRoute } from "./routes/phases/purchase.js";
import { combatMoveRoute } from "./routes/phases/combatMove.js";
import { conductCombatRoute } from "./routes/phases/conductCombat.js";
import { noncombatMoveRoute } from "./routes/phases/noncombatMove.js";
import { mobilizeRoute } from "./routes/phases/mobilize.js";
import { collectIncomeRoute } from "./routes/phases/collectIncome.js";
import { nextPhaseRoute } from "./routes/phases/nextPhase.js";
import { joinGameRoom, leaveGameRoom } from "./sockets/gameRoom.js";
import { db } from "./db.js";

// ─── Fastify ──────────────────────────────────────────────────────────────────

const fastify = Fastify({
  // Always use info so startup messages appear in container logs.
  logger: { level: "info" },
});

// ─── Plugins ──────────────────────────────────────────────────────────────────

await fastify.register(fastifyCors, {
  origin: config.webUrl,
  credentials: true,
});

await fastify.register(fastifyCookie);

// ─── Routes ───────────────────────────────────────────────────────────────────

await fastify.register(authRoutes, { prefix: "/api" });
await fastify.register(gameRoutes, { prefix: "/api" });
await fastify.register(purchaseRoute, { prefix: "/api" });
await fastify.register(combatMoveRoute, { prefix: "/api" });
await fastify.register(conductCombatRoute, { prefix: "/api" });
await fastify.register(noncombatMoveRoute, { prefix: "/api" });
await fastify.register(mobilizeRoute, { prefix: "/api" });
await fastify.register(collectIncomeRoute, { prefix: "/api" });
await fastify.register(nextPhaseRoute, { prefix: "/api" });

// ─── Health check ─────────────────────────────────────────────────────────────

fastify.get("/health", async (_request, reply) => {
  return reply.send({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Initialize (without listening) ──────────────────────────────────────────
//
// fastify.ready() runs all plugin onReady hooks. We must do this before
// attaching Socket.io so that fastify.server exists and is fully configured.

await fastify.ready();

// ─── Socket.io ────────────────────────────────────────────────────────────────
//
// Attach Socket.io to the *same* http.Server that Fastify owns.
// Do NOT wrap fastify.server in createServer() — that produces a second,
// empty server with no Fastify handler.

export const io = new SocketServer(fastify.server, {
  cors: {
    origin: config.webUrl,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Make io accessible to route handlers via fastify instance decoration.
(fastify as unknown as { io: SocketServer }).io = io;

// ─── Socket.io connection handling ───────────────────────────────────────────

io.on("connection", async (socket) => {
  fastify.log.info({ socketId: socket.id }, "Socket connected");

  const cookieHeader = socket.handshake.headers.cookie ?? "";
  const cookies = parseCookieHeader(cookieHeader);
  const sessionId = cookies["aa_session"];

  let authenticatedUserId: string | null = null;
  let authenticatedUsername: string | null = null;

  if (sessionId) {
    const { session, user } = await lucia.validateSession(sessionId);
    if (session && user) {
      authenticatedUserId = user.id;
      authenticatedUsername = user.username;
      fastify.log.info(
        { socketId: socket.id, userId: user.id },
        "Socket authenticated",
      );
    }
  }

  if (!authenticatedUserId) {
    fastify.log.warn(
      { socketId: socket.id },
      "Unauthenticated socket — limited access",
    );
  }

  socket.on("game:join", async (data: { gameId: string }) => {
    const { gameId } = data;
    if (!gameId || !authenticatedUserId) return;

    const player = await db.gamePlayer.findFirst({
      where: { gameId, userId: authenticatedUserId },
    });

    if (player) {
      joinGameRoom(socket, gameId);
      fastify.log.info({ socketId: socket.id, gameId }, "Joined game room");
      socket.to(`game:${gameId}`).emit("game:player_connected", {
        gameId,
        userId: authenticatedUserId,
        username: authenticatedUsername ?? "Unknown",
      });
    }
  });

  socket.on("game:leave", (data: { gameId: string }) => {
    const { gameId } = data;
    if (!gameId) return;
    leaveGameRoom(socket, gameId);
    if (authenticatedUserId) {
      socket.to(`game:${gameId}`).emit("game:player_disconnected", {
        gameId,
        userId: authenticatedUserId,
        username: authenticatedUsername ?? "Unknown",
      });
    }
  });

  socket.on("disconnect", (reason) => {
    fastify.log.info({ socketId: socket.id, reason }, "Socket disconnected");
    for (const room of socket.rooms) {
      if (room.startsWith("game:") && authenticatedUserId) {
        const gameId = room.replace("game:", "");
        io.to(room).emit("game:player_disconnected", {
          gameId,
          userId: authenticatedUserId,
          username: authenticatedUsername ?? "Unknown",
        });
      }
    }
  });
});

// ─── Start listening ──────────────────────────────────────────────────────────

try {
  await fastify.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  fastify.log.info("Shutting down...");
  io.close();
  await fastify.close();
  await db.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

// ─── Utility ─────────────────────────────────────────────────────────────────

function parseCookieHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const value = decodeURIComponent(part.slice(eqIdx + 1).trim());
    result[key] = value;
  }
  return result;
}
