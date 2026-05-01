/**
 * Axis & Allies server entry point.
 *
 * - Creates a Fastify instance with JSON logging.
 * - Registers CORS, cookie, and all route plugins.
 * - Attaches Socket.io to the underlying HTTP server.
 * - Authenticates socket connections via session cookie.
 * - Listens on the configured port.
 */

import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import { createServer } from "http";
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
  logger: config.nodeEnv === "production"
    ? { level: "warn" }
    : { level: "info" },
});

// ─── HTTP server (wrapping Fastify for Socket.io) ────────────────────────────

const httpServer = createServer(fastify.server);

// ─── Socket.io ────────────────────────────────────────────────────────────────

export const io = new SocketServer(httpServer, {
  cors: {
    origin: config.webUrl,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Attach io to fastify instance so routes can access it
(fastify as unknown as { io: SocketServer }).io = io;

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

// ─── Socket.io connection handling ───────────────────────────────────────────

io.on("connection", async (socket) => {
  fastify.log.info({ socketId: socket.id }, "Socket connected");

  // Authenticate via session cookie
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
      "Unauthenticated socket connection — limited access",
    );
  }

  // ── Event: join a game room ──────────────────────────────────────────────
  socket.on("game:join", async (data: { gameId: string }) => {
    const { gameId } = data;
    if (!gameId) return;

    // Verify user is a player in this game
    if (authenticatedUserId) {
      const player = await db.gamePlayer.findFirst({
        where: { gameId, userId: authenticatedUserId },
      });

      if (player) {
        joinGameRoom(socket, gameId);
        fastify.log.info(
          { socketId: socket.id, gameId },
          "Socket joined game room",
        );

        // Notify other players
        socket.to(`game:${gameId}`).emit("game:player_connected", {
          gameId,
          userId: authenticatedUserId,
          username: authenticatedUsername ?? "Unknown",
        });
      }
    }
  });

  // ── Event: leave a game room ─────────────────────────────────────────────
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

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    fastify.log.info(
      { socketId: socket.id, reason },
      "Socket disconnected",
    );

    // Notify all rooms this socket was in
    for (const room of socket.rooms) {
      if (room.startsWith("game:")) {
        const gameId = room.replace("game:", "");
        if (authenticatedUserId) {
          io.to(room).emit("game:player_disconnected", {
            gameId,
            userId: authenticatedUserId,
            username: authenticatedUsername ?? "Unknown",
          });
        }
      }
    }
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    await fastify.ready();

    httpServer.listen(config.port, "0.0.0.0", () => {
      fastify.log.info(
        { port: config.port, env: config.nodeEnv },
        "Server listening",
      );
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

void start();

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

/**
 * Minimal cookie header parser that returns a key→value map.
 * Only used for Socket.io authentication where the cookie middleware
 * from Fastify is not available.
 */
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
