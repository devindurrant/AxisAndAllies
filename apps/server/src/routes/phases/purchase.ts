/**
 * POST /api/games/:id/phases/purchase
 *
 * Stores a player's unit purchase order in the current Turn's actionLog.
 * Validates that the total IPC cost does not exceed the player's balance.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { UnitType, TurnPhase } from "@aa/shared";
import { UNIT_STATS } from "@aa/shared";
import { requireAuth } from "../../auth/middleware.js";
import { assertActivePlayer, getCurrentTurn } from "../../services/gameService.js";
import { db } from "../../db.js";

// ─── Schema ───────────────────────────────────────────────────────────────────

const PurchaseBodySchema = z.object({
  purchases: z.array(
    z.object({
      type: z.nativeEnum(UnitType),
      quantity: z.number().int().positive(),
    }),
  ),
});

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function purchaseRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { id: string } }>(
    "/games/:id/phases/purchase",
    { preHandler: requireAuth },
    async (request, reply) => {
      const gameId = request.params.id;

      // Validate body
      const parseResult = PurchaseBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Validation error",
          details: parseResult.error.flatten().fieldErrors,
        });
      }
      const { purchases } = parseResult.data;

      // Assert it is this player's turn
      const { player } = await assertActivePlayer(gameId, request.user.id);

      // Verify we are in PURCHASE_UNITS phase
      const turn = await getCurrentTurn(gameId);
      if (!turn || turn.phase !== TurnPhase.PURCHASE_UNITS) {
        return reply.status(409).send({ error: "Not in purchase phase" });
      }

      // Calculate total IPC cost
      let totalCost = 0;
      for (const purchase of purchases) {
        const stats = UNIT_STATS[purchase.type];
        if (!stats) {
          return reply.status(400).send({ error: `Unknown unit type: ${purchase.type}` });
        }
        // Industrial complexes cannot be purchased mid-game
        if (purchase.type === UnitType.INDUSTRIAL_COMPLEX) {
          return reply.status(400).send({ error: "Industrial complexes cannot be purchased" });
        }
        totalCost += stats.cost * purchase.quantity;
      }

      if (totalCost > player.ipcBalance) {
        return reply.status(400).send({
          error: `Insufficient IPC: order costs ${totalCost} but you have ${player.ipcBalance}`,
        });
      }

      // Append purchase entry to action log
      const currentLog = Array.isArray(turn.actionLog) ? turn.actionLog : [];
      const updatedLog = [
        ...currentLog,
        {
          type: "PURCHASE",
          purchases,
          totalCost,
          timestamp: new Date().toISOString(),
        },
      ];

      const updatedTurn = await db.turn.update({
        where: { id: turn.id },
        data: { actionLog: updatedLog },
      });

      return reply.send({ turn: updatedTurn });
    },
  );
}
