/**
 * POST /api/games/:id/phases/next
 *
 * Advances the game to the next phase/power/round.
 * Creates a new Turn record and notifies the next player.
 */

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/middleware.js";
import { assertActivePlayer, advancePhase, getGame } from "../../services/gameService.js";
import { db } from "../../db.js";

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function nextPhaseRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { id: string } }>(
    "/games/:id/phases/next",
    { preHandler: requireAuth },
    async (request, reply) => {
      const gameId = request.params.id;

      // Verify requesting user is the active player
      await assertActivePlayer(gameId, request.user.id);

      // Advance to the next phase
      const next = await advancePhase(gameId);

      // Look up the user ID for the next active power's player
      const nextPlayer = await db.gamePlayer.findFirst({
        where: { gameId, power: next.power },
        include: { user: { select: { id: true, email: true, username: true } } },
      });

      // Emit socket notifications
      const io = (fastify as unknown as { io: import("socket.io").Server }).io;
      if (io) {
        io.to(`game:${gameId}`).emit("game:state_updated", {
          gameId,
          activePower: next.power,
          activePhase: next.phase,
          currentRound: next.round,
        });

        if (nextPlayer) {
          io.to(`game:${gameId}`).emit("game:your_turn", {
            gameId,
            userId: nextPlayer.userId,
            power: next.power,
            phase: next.phase,
            round: next.round,
          });
        }
      }

      // Return summary of new game state
      const game = await getGame(gameId);

      return reply.send({
        activePower: next.power,
        activePhase: next.phase,
        currentRound: next.round,
        nextPlayer: nextPlayer
          ? {
              userId: nextPlayer.userId,
              username: nextPlayer.user.username,
              power: nextPlayer.power,
            }
          : null,
        game,
      });
    },
  );
}
