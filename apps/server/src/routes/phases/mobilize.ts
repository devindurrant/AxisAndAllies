/**
 * POST /api/games/:id/phases/mobilize
 *
 * Places purchased units from the Turn's actionLog onto friendly territories
 * with Industrial Complexes. Deducts IPC cost from player balance.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { UnitType, TurnPhase, UNIT_STATS, TERRITORIES } from "@aa/shared";
import { requireAuth } from "../../auth/middleware.js";
import { assertActivePlayer, getCurrentTurn } from "../../services/gameService.js";
import { db } from "../../db.js";

// ─── Schema ───────────────────────────────────────────────────────────────────

const MobilizeBodySchema = z.object({
  placements: z.array(
    z.object({
      type: z.nativeEnum(UnitType),
      territoryKey: z.string().min(1),
    }),
  ),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * IPC value (production capacity) for a territory, pulled from static map data.
 */
function getTerritoryIpcValue(territoryKey: string): number {
  const t = TERRITORIES.find((t) => t.key === territoryKey);
  return t?.ipcValue ?? 0;
}

/**
 * Whether a territory has a factory in static map data (starting factories).
 * At runtime we also check for in-game industrial complex units.
 */
function hasStartingFactory(territoryKey: string): boolean {
  const t = TERRITORIES.find((t) => t.key === territoryKey);
  return t?.hasFactory ?? false;
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function mobilizeRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Params: { id: string } }>(
    "/games/:id/phases/mobilize",
    { preHandler: requireAuth },
    async (request, reply) => {
      const gameId = request.params.id;

      const parseResult = MobilizeBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Validation error",
          details: parseResult.error.flatten().fieldErrors,
        });
      }
      const { placements } = parseResult.data;

      const { player } = await assertActivePlayer(gameId, request.user.id);

      const turn = await getCurrentTurn(gameId);
      if (!turn || turn.phase !== TurnPhase.MOBILIZE_UNITS) {
        return reply.status(409).send({ error: "Not in mobilize units phase" });
      }

      // Extract purchase order from actionLog (find the most recent PURCHASE entry)
      const actionLog = Array.isArray(turn.actionLog) ? turn.actionLog : [];
      const purchaseEntries = actionLog.filter(
        (entry: unknown) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as { type: string }).type === "PURCHASE",
      );
      const purchaseEntry = purchaseEntries[purchaseEntries.length - 1] as
        | {
            purchases: Array<{ type: string; quantity: number }>;
            totalCost: number;
          }
        | undefined;

      if (!purchaseEntry) {
        return reply.status(409).send({
          error: "No purchase order found in this turn's action log",
        });
      }

      // Build a budget of what was purchased
      const purchaseBudget = new Map<string, number>();
      for (const p of purchaseEntry.purchases) {
        purchaseBudget.set(p.type, (purchaseBudget.get(p.type) ?? 0) + p.quantity);
      }

      // Count placements against budget
      const placementCount = new Map<string, number>();
      for (const p of placements) {
        placementCount.set(p.type, (placementCount.get(p.type) ?? 0) + 1);
      }

      for (const [type, count] of placementCount) {
        const available = purchaseBudget.get(type) ?? 0;
        if (count > available) {
          return reply.status(400).send({
            error: `Trying to place ${count} ${type} but only purchased ${available}`,
          });
        }
      }

      // Fetch territory states to verify control
      const territoryStates = await db.territoryState.findMany({
        where: { gameId },
      });
      const controlMap = new Map(
        territoryStates.map((ts) => [ts.territoryKey, ts.controlledBy]),
      );

      // Fetch in-game industrial complex units for factory detection
      const factories = await db.unit.findMany({
        where: {
          gameId,
          type: UnitType.INDUSTRIAL_COMPLEX,
          power: player.power,
        },
        select: { territoryKey: true },
      });
      const factoryKeys = new Set([
        ...factories.map((f) => f.territoryKey),
        // Include starting factories that the player still controls
        ...TERRITORIES.filter((t) => t.hasFactory).map((t) => t.key),
      ]);

      // Count placements per territory (for capacity check)
      const placementsPerTerritory = new Map<string, number>();
      for (const p of placements) {
        placementsPerTerritory.set(
          p.territoryKey,
          (placementsPerTerritory.get(p.territoryKey) ?? 0) + 1,
        );
      }

      // Validate each placement territory
      for (const [territoryKey, count] of placementsPerTerritory) {
        const controller = controlMap.get(territoryKey);
        if (controller !== player.power) {
          return reply.status(400).send({
            error: `Territory ${territoryKey} is not controlled by you`,
          });
        }

        const hasFactory = factoryKeys.has(territoryKey);
        if (!hasFactory) {
          return reply.status(400).send({
            error: `Territory ${territoryKey} has no Industrial Complex`,
          });
        }

        const capacity = getTerritoryIpcValue(territoryKey);
        if (count > capacity) {
          return reply.status(400).send({
            error: `Territory ${territoryKey} has production capacity ${capacity} but ${count} units were placed`,
          });
        }
      }

      // Calculate total cost of placements
      let totalCost = 0;
      for (const p of placements) {
        totalCost += UNIT_STATS[p.type].cost;
      }

      if (totalCost > player.ipcBalance) {
        return reply.status(400).send({
          error: `Insufficient IPC: placements cost ${totalCost} but you have ${player.ipcBalance}`,
        });
      }

      // Create units and deduct IPC in a transaction
      await db.$transaction([
        db.unit.createMany({
          data: placements.map((p) => ({
            gameId,
            territoryKey: p.territoryKey,
            power: player.power,
            type: p.type,
            isDisabled: false,
            hasMoved: false,
          })),
        }),
        db.gamePlayer.update({
          where: { id: player.id },
          data: { ipcBalance: { decrement: totalCost } },
        }),
        db.turn.update({
          where: { id: turn.id },
          data: {
            actionLog: [
              ...actionLog,
              {
                type: "MOBILIZE",
                placements,
                totalCost,
                timestamp: new Date().toISOString(),
              },
            ],
          },
        }),
      ]);

      const updatedPlayer = await db.gamePlayer.findUnique({
        where: { id: player.id },
      });

      return reply.send({
        success: true,
        placements,
        totalCost,
        newIpcBalance: updatedPlayer?.ipcBalance ?? 0,
      });
    },
  );
}
