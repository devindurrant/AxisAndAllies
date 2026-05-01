/**
 * POST /api/games/:id/phases/combat/:territory
 *
 * Resolves ONE combat round in the specified territory.
 * - Rolls dice via diceService (crypto.randomInt).
 * - Applies player-chosen casualties.
 * - Persists a CombatEvent record.
 * - Emits socket event with result.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TurnPhase, applyArtilleryBoost, UNIT_STATS, UnitType as SharedUnitType } from "@aa/shared";
import type { CombatUnit } from "@aa/shared";
import { requireAuth } from "../../auth/middleware.js";
import { assertActivePlayer, getCurrentTurn } from "../../services/gameService.js";
import { rollDice } from "../../services/diceService.js";
import { db } from "../../db.js";
import type { PowerName as PrismaPowerName } from "@prisma/client";

// ─── Schema ───────────────────────────────────────────────────────────────────

const ConductCombatBodySchema = z.object({
  attackerCasualties: z.array(z.string()),
  defenderCasualties: z.array(z.string()),
});

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function conductCombatRoute(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post<{ Params: { id: string; territory: string } }>(
    "/games/:id/phases/combat/:territory",
    { preHandler: requireAuth },
    async (request, reply) => {
      const gameId = request.params.id;
      const territoryKey = request.params.territory;

      const parseResult = ConductCombatBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Validation error",
          details: parseResult.error.flatten().fieldErrors,
        });
      }
      const { attackerCasualties, defenderCasualties } = parseResult.data;

      const { player, game } = await assertActivePlayer(gameId, request.user.id);

      const turn = await getCurrentTurn(gameId);
      if (!turn || turn.phase !== TurnPhase.CONDUCT_COMBAT) {
        return reply.status(409).send({ error: "Not in conduct combat phase" });
      }

      // Fetch territory state to determine defender power
      const territoryState = await db.territoryState.findUnique({
        where: { gameId_territoryKey: { gameId, territoryKey } },
      });

      if (!territoryState || !territoryState.controlledBy) {
        return reply.status(400).send({
          error: `Territory ${territoryKey} not found or has no controller`,
        });
      }

      const attackingPower = player.power as PrismaPowerName;
      const defendingPower = territoryState.controlledBy as PrismaPowerName;

      if (attackingPower === defendingPower) {
        return reply.status(400).send({
          error: "Cannot conduct combat in a friendly territory",
        });
      }

      // Fetch units in the territory
      const allUnitsInTerritory = await db.unit.findMany({
        where: { gameId, territoryKey },
      });

      const attackers = allUnitsInTerritory.filter(
        (u) => u.power === attackingPower,
      );
      const defenders = allUnitsInTerritory.filter(
        (u) => u.power === defendingPower,
      );

      if (attackers.length === 0) {
        return reply.status(400).send({
          error: "No attacking units in this territory",
        });
      }
      if (defenders.length === 0) {
        return reply.status(400).send({
          error: "No defending units in this territory",
        });
      }

      // Build CombatUnit arrays for the shared engine
      const attackerUnits: CombatUnit[] = attackers.map((u) => ({
        id: u.id,
        type: u.type as SharedUnitType,
        power: u.power as import("@aa/shared").PowerName,
        isDisabled: u.isDisabled,
      }));

      const defenderUnits: CombatUnit[] = defenders.map((u) => ({
        id: u.id,
        type: u.type as SharedUnitType,
        power: u.power as import("@aa/shared").PowerName,
        isDisabled: u.isDisabled,
      }));

      // Roll dice using crypto.randomInt
      const boostMap = applyArtilleryBoost(attackerUnits);

      const eligibleAttackers = attackerUnits.filter((u) => {
        const eff = boostMap.get(u.id) ?? UNIT_STATS[u.type].attack;
        return eff > 0;
      });
      const eligibleDefenders = defenderUnits.filter(
        (u) => UNIT_STATS[u.type].defense > 0,
      );

      const attackDice = rollDice(eligibleAttackers.length);
      const defenseDice = rollDice(eligibleDefenders.length);

      // Calculate hits
      let attackHits = 0;
      for (let i = 0; i < eligibleAttackers.length; i++) {
        const threshold =
          boostMap.get(eligibleAttackers[i].id) ??
          UNIT_STATS[eligibleAttackers[i].type].attack;
        if (attackDice[i] <= threshold) attackHits++;
      }

      let defenseHits = 0;
      for (let i = 0; i < eligibleDefenders.length; i++) {
        const threshold = UNIT_STATS[eligibleDefenders[i].type].defense;
        if (defenseDice[i] <= threshold) defenseHits++;
      }

      // Validate casualty counts match hits
      if (attackerCasualties.length !== defenseHits) {
        return reply.status(400).send({
          error: `Defense scored ${defenseHits} hits but ${attackerCasualties.length} attacker casualties were submitted`,
          attackHits,
          defenseHits,
          attackDice,
          defenseDice,
        });
      }
      if (defenderCasualties.length !== attackHits) {
        return reply.status(400).send({
          error: `Attack scored ${attackHits} hits but ${defenderCasualties.length} defender casualties were submitted`,
          attackHits,
          defenseHits,
          attackDice,
          defenseDice,
        });
      }

      // Validate that submitted casualty IDs belong to the right side
      const attackerIds = new Set(attackers.map((u) => u.id));
      const defenderIds = new Set(defenders.map((u) => u.id));

      for (const id of attackerCasualties) {
        if (!attackerIds.has(id)) {
          return reply.status(400).send({
            error: `Attacker casualty ${id} is not an attacking unit in this territory`,
          });
        }
      }
      for (const id of defenderCasualties) {
        if (!defenderIds.has(id)) {
          return reply.status(400).send({
            error: `Defender casualty ${id} is not a defending unit in this territory`,
          });
        }
      }

      // Handle battleship two-hit rule: first hit disables instead of destroying
      const unitsToRemove: string[] = [];
      const unitsToDisable: string[] = [];

      for (const id of [...attackerCasualties, ...defenderCasualties]) {
        const unit = allUnitsInTerritory.find((u) => u.id === id);
        if (!unit) continue;

        const isBattleship = UNIT_STATS[unit.type as SharedUnitType].specialRules.includes("two_hit");
        if (isBattleship && !unit.isDisabled) {
          unitsToDisable.push(id);
        } else {
          unitsToRemove.push(id);
        }
      }

      // Build unitsLost record for audit trail
      const unitsLost = {
        attackerLosses: attackerCasualties.map((id) => {
          const u = attackers.find((a) => a.id === id);
          return { id, type: u?.type };
        }),
        defenderLosses: defenderCasualties.map((id) => {
          const u = defenders.find((d) => d.id === id);
          return { id, type: u?.type };
        }),
      };

      // Determine how many previous combat rounds have occurred in this territory this turn
      const previousCombatEvents = await db.combatEvent.count({
        where: { gameId, territoryKey, roundNumber: game.currentRound },
      });

      // Persist to DB in a transaction
      const [combatEvent] = await db.$transaction([
        db.combatEvent.create({
          data: {
            gameId,
            roundNumber: game.currentRound,
            territoryKey,
            attackingPower,
            defendingPower,
            combatRound: previousCombatEvents + 1,
            attackDice,
            defenseDice,
            attackHits,
            defenseHits,
            unitsLost,
          },
        }),
        // Remove fully destroyed units
        ...(unitsToRemove.length > 0
          ? [db.unit.deleteMany({ where: { id: { in: unitsToRemove } } })]
          : []),
        // Disable (damage) battleships
        ...(unitsToDisable.length > 0
          ? [
              db.unit.updateMany({
                where: { id: { in: unitsToDisable } },
                data: { isDisabled: true },
              }),
            ]
          : []),
      ]);

      // Check if combat is over (no defenders or no attackers left)
      const remainingUnits = await db.unit.findMany({
        where: { gameId, territoryKey },
      });

      const remainingAttackers = remainingUnits.filter(
        (u) => u.power === attackingPower,
      );
      const remainingDefenders = remainingUnits.filter(
        (u) => u.power === defendingPower,
      );

      const attackerWins = remainingDefenders.length === 0 && remainingAttackers.length > 0;
      const defenderWins = remainingAttackers.length === 0;

      // If attacker wins, transfer territory control
      if (attackerWins) {
        await db.territoryState.update({
          where: { gameId_territoryKey: { gameId, territoryKey } },
          data: { controlledBy: attackingPower },
        });
      }

      const result = {
        combatEventId: combatEvent.id,
        attackerRolls: attackDice,
        defenderRolls: defenseDice,
        attackerHits: attackHits,
        defenderHits: defenseHits,
        attackerCasualties: unitsLost.attackerLosses,
        defenderCasualties: unitsLost.defenderLosses,
        remainingAttackers: remainingAttackers.length,
        remainingDefenders: remainingDefenders.length,
        attackerWins,
        defenderWins,
        territoryKey,
        log: [],
      };

      // Emit socket event via the io instance (attached to fastify)
      const io = (fastify as unknown as { io: import("socket.io").Server }).io;
      if (io) {
        io.to(`game:${gameId}`).emit("game:combat_result", result);
      }

      return reply.send(result);
    },
  );
}
