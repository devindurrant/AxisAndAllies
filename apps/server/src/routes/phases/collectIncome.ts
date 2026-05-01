/**
 * POST /api/games/:id/phases/collect
 *
 * Calculates income from controlled territories, adds it to the player's IPC
 * balance, completes the current Turn, and advances to the next phase.
 */

import type { FastifyInstance } from "fastify";
import { TurnPhase, calculateIncome, getControlledTerritories, TERRITORIES } from "@aa/shared";
import type { GameTerritoryState } from "@aa/shared";
import { requireAuth } from "../../auth/middleware.js";
import { assertActivePlayer, getCurrentTurn, advancePhase } from "../../services/gameService.js";
import { db } from "../../db.js";

// ─── IPC value lookup built from static map data ──────────────────────────────

const TERRITORY_IPC_VALUES: Record<string, number> = Object.fromEntries(
  TERRITORIES.map((t) => [t.key, t.ipcValue]),
);

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function collectIncomeRoute(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post<{ Params: { id: string } }>(
    "/games/:id/phases/collect",
    { preHandler: requireAuth },
    async (request, reply) => {
      const gameId = request.params.id;

      const { player } = await assertActivePlayer(gameId, request.user.id);

      const turn = await getCurrentTurn(gameId);
      if (!turn || turn.phase !== TurnPhase.COLLECT_INCOME) {
        return reply.status(409).send({ error: "Not in collect income phase" });
      }

      // Fetch current territory control state
      const territoryStates = await db.territoryState.findMany({
        where: { gameId },
      });

      const gameStates: GameTerritoryState[] = territoryStates.map((ts) => ({
        key: ts.territoryKey,
        controlledBy: ts.controlledBy as import("@aa/shared").PowerName | null,
      }));

      // Calculate income using shared income module
      const controlled = getControlledTerritories(
        player.power as import("@aa/shared").PowerName,
        gameStates,
      );
      const income = calculateIncome(controlled, TERRITORY_IPC_VALUES);

      // Credit IPC, complete the turn
      await db.$transaction([
        db.gamePlayer.update({
          where: { id: player.id },
          data: { ipcBalance: { increment: income } },
        }),
        db.turn.update({
          where: { id: turn.id },
          data: {
            completedAt: new Date(),
            actionLog: [
              ...(Array.isArray(turn.actionLog) ? turn.actionLog : []),
              {
                type: "COLLECT_INCOME",
                income,
                controlled,
                timestamp: new Date().toISOString(),
              },
            ],
          },
        }),
        // Reset hasMoved for all the player's units so next turn is clean
        db.unit.updateMany({
          where: { gameId, power: player.power },
          data: { hasMoved: false },
        }),
      ]);

      // Advance to next phase
      const next = await advancePhase(gameId);

      // Notify next player via socket
      const io = (fastify as unknown as { io: import("socket.io").Server }).io;
      if (io) {
        io.to(`game:${gameId}`).emit("game:your_turn", {
          gameId,
          power: next.power,
          phase: next.phase,
          round: next.round,
        });
        io.to(`game:${gameId}`).emit("game:state_updated", {
          gameId,
          activePower: next.power,
          activePhase: next.phase,
          currentRound: next.round,
        });
      }

      const updatedPlayer = await db.gamePlayer.findUnique({
        where: { id: player.id },
      });

      return reply.send({
        income,
        controlled,
        newIpcBalance: updatedPlayer?.ipcBalance ?? 0,
        nextPower: next.power,
        nextPhase: next.phase,
        nextRound: next.round,
      });
    },
  );
}
