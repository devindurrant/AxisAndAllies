/**
 * Game management routes: list, create, get, join, and ready.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PowerName } from "@aa/shared";
import { requireAuth } from "../auth/middleware.js";
import {
  createGame,
  getGame,
  listGamesForUser,
  listOpenGames,
  joinGame,
  setPlayerReady,
  serializeGameState,
  serializeGameSummary,
} from "../services/gameService.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateGameSchema = z.object({
  name: z.string().min(1, "Name is required").max(64),
  power: z.nativeEnum(PowerName),
});

const JoinGameSchema = z.object({
  power: z.nativeEnum(PowerName),
});

// ─── Plugin ───────────────────────────────────────────────────────────────────

export async function gameRoutes(fastify: FastifyInstance): Promise<void> {
  // All game routes require authentication
  fastify.addHook("preHandler", requireAuth);

  // ── GET /api/games ────────────────────────────────────────────────────────
  fastify.get("/games", async (request, reply) => {
    const [myGames, openGames] = await Promise.all([
      listGamesForUser(request.user.id),
      listOpenGames(request.user.id),
    ]);
    const games = [
      ...myGames.map(serializeGameSummary),
      ...openGames.map(serializeGameSummary),
    ];
    return reply.send({ games });
  });

  // ── POST /api/games ───────────────────────────────────────────────────────
  fastify.post("/games", async (request, reply) => {
    const parseResult = CreateGameSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Validation error",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { name, power } = parseResult.data;

    const game = await createGame(name, request.user.id, power);
    return reply.status(201).send({ game: serializeGameState(game) });
  });

  // ── GET /api/games/:id ────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>("/games/:id", async (request, reply) => {
    const game = await getGame(request.params.id);
    return reply.send({ game: serializeGameState(game) });
  });

  // ── POST /api/games/:id/join ──────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    "/games/:id/join",
    async (request, reply) => {
      const parseResult = JoinGameSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Validation error",
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { power } = parseResult.data;

      const player = await joinGame(request.params.id, request.user.id, power);
      return reply.status(201).send({ player });
    },
  );

  // ── POST /api/games/:id/ready ─────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>(
    "/games/:id/ready",
    async (request, reply) => {
      await setPlayerReady(request.params.id, request.user.id);
      return reply.send({ success: true });
    },
  );
}
