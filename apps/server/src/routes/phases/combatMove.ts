/**
 * POST /api/games/:id/phases/combat-move
 *
 * Validates and applies combat move orders for the active player.
 * Each move is validated against the shared isValidCombatMove function.
 * Unit positions are updated in DB and moves are logged to the Turn actionLog.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TurnPhase, PowerName, isValidCombatMove, TERRITORIES } from "@aa/shared";
import type { TerritoryNode, GameTerritoryState } from "@aa/shared";
import { requireAuth } from "../../auth/middleware.js";
import { assertActivePlayer, getCurrentTurn } from "../../services/gameService.js";
import { db } from "../../db.js";

// ─── Schema ───────────────────────────────────────────────────────────────────

const CombatMoveBodySchema = z.object({
  moves: z.array(
    z.object({
      unitId: z.string().min(1),
      toTerritory: z.string().min(1),
    }),
  ),
});

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function combatMoveRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { id: string } }>(
    "/games/:id/phases/combat-move",
    { preHandler: requireAuth },
    async (request, reply) => {
      const gameId = request.params.id;

      const parseResult = CombatMoveBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Validation error",
          details: parseResult.error.flatten().fieldErrors,
        });
      }
      const { moves } = parseResult.data;

      const { player } = await assertActivePlayer(gameId, request.user.id);

      const turn = await getCurrentTurn(gameId);
      if (!turn || turn.phase !== TurnPhase.COMBAT_MOVE) {
        return reply.status(409).send({ error: "Not in combat move phase" });
      }

      // Fetch game units and territory states for validation
      const [gameUnits, territoryStates] = await Promise.all([
        db.unit.findMany({ where: { gameId, power: player.power } }),
        db.territoryState.findMany({ where: { gameId } }),
      ]);

      // Build movement graph from shared map data
      const territoryNodes: TerritoryNode[] = TERRITORIES.map((t) => ({
        key: t.key,
        type: t.type,
        adjacentTo: t.adjacencies,
      }));

      const gameStates: GameTerritoryState[] = territoryStates.map((ts) => ({
        key: ts.territoryKey,
        controlledBy: ts.controlledBy as PowerName | null,
      }));

      // Validate all moves up front before applying any
      const unitMap = new Map(gameUnits.map((u) => [u.id, u]));
      const appliedMoves: Array<{ unitId: string; from: string; to: string }> = [];

      for (const move of moves) {
        const unit = unitMap.get(move.unitId);
        if (!unit) {
          return reply.status(400).send({
            error: `Unit ${move.unitId} not found or not owned by you`,
          });
        }
        if (unit.hasMoved) {
          return reply.status(400).send({
            error: `Unit ${move.unitId} has already moved this turn`,
          });
        }

        const valid = isValidCombatMove(
          unit.territoryKey,
          move.toTerritory,
          unit.type as import("@aa/shared").UnitType,
          player.power as import("@aa/shared").PowerName,
          territoryNodes,
          gameStates,
        );

        if (!valid) {
          return reply.status(400).send({
            error: `Invalid combat move for unit ${move.unitId} to ${move.toTerritory}`,
          });
        }

        appliedMoves.push({
          unitId: move.unitId,
          from: unit.territoryKey,
          to: move.toTerritory,
        });
      }

      // Apply moves in a transaction
      await db.$transaction([
        ...appliedMoves.map((m) =>
          db.unit.update({
            where: { id: m.unitId },
            data: { territoryKey: m.to, hasMoved: true },
          }),
        ),
        db.turn.update({
          where: { id: turn.id },
          data: {
            actionLog: [
              ...(Array.isArray(turn.actionLog) ? turn.actionLog : []),
              {
                type: "COMBAT_MOVE",
                moves: appliedMoves,
                timestamp: new Date().toISOString(),
              },
            ],
          },
        }),
      ]);

      const updatedTurn = await db.turn.findUnique({ where: { id: turn.id } });
      return reply.send({ turn: updatedTurn, moves: appliedMoves });
    },
  );
}
