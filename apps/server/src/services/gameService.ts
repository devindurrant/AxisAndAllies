/**
 * Core game service — manages game lifecycle, player joins, phase transitions,
 * and territory/unit seeding.
 */

import type {
  Game,
  GamePlayer,
  TerritoryState,
  Unit,
  Turn,
  CombatEvent,
} from "@prisma/client";
import { GameStatus, PowerName, TurnPhase, advanceTurn, TERRITORIES, STARTING_UNITS, STARTING_IPC } from "@aa/shared";
import type { UnitType as PrismaUnitType } from "@prisma/client";
import { db } from "../db.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FullGame = Game & {
  players: (GamePlayer & { user: { id: string; username: string; email: string } })[];
  territories: TerritoryState[];
  units: Unit[];
  turns: Turn[];
  combatEvents: CombatEvent[];
};

type GameWithPlayers = Game & {
  players: (GamePlayer & { user: { id: string; username: string; email: string } })[];
};

// ─── Include definition used throughout ──────────────────────────────────────

const FULL_GAME_INCLUDE = {
  players: {
    include: {
      user: {
        select: { id: true, username: true, email: true },
      },
    },
  },
  territories: true,
  units: true,
  turns: {
    orderBy: { startedAt: "asc" as const },
  },
  combatEvents: {
    orderBy: { id: "asc" as const },
  },
} as const;

// ─── GameService ──────────────────────────────────────────────────────────────

/**
 * Create a new game and seed starting state.
 *
 * - Seeds TerritoryState rows from shared mapData.
 * - Places starting units from STARTING_UNITS.
 * - Sets initial IPC balance for the creator's power.
 * - Sets the creator as the sole GamePlayer with isReady = false.
 */
export async function createGame(
  name: string,
  creatorUserId: string,
  creatorPower: PowerName,
): Promise<FullGame> {
  // Build territory state seed data
  const territorySeeds = TERRITORIES.map((t) => ({
    territoryKey: t.key,
    controlledBy: t.startingController ?? undefined,
  }));

  // Build unit seed data (expand quantity into individual unit rows)
  const unitSeeds: Array<{
    territoryKey: string;
    power: PowerName;
    type: PrismaUnitType;
    isDisabled: boolean;
    hasMoved: boolean;
  }> = [];

  for (const su of STARTING_UNITS) {
    for (let i = 0; i < su.quantity; i++) {
      unitSeeds.push({
        territoryKey: su.territoryKey,
        power: su.power as PowerName,
        type: su.type as PrismaUnitType,
        isDisabled: false,
        hasMoved: false,
      });
    }
  }

  // Use the income module's starting IPC values as authoritative source,
  // falling back to mapData if income module has different values
  const startingIpc =
    STARTING_IPC[creatorPower] ?? 0;

  const game = await db.game.create({
    data: {
      name,
      status: GameStatus.LOBBY,
      currentRound: 1,
      activePower: PowerName.USSR,
      activePhase: TurnPhase.PURCHASE_UNITS,
      players: {
        create: {
          userId: creatorUserId,
          power: creatorPower,
          isReady: false,
          ipcBalance: startingIpc,
        },
      },
      territories: {
        createMany: { data: territorySeeds },
      },
      units: {
        createMany: { data: unitSeeds },
      },
    },
    include: FULL_GAME_INCLUDE,
  });

  return game as FullGame;
}

/**
 * Fetch a full game by ID with all relations. Throws if not found.
 */
export async function getGame(gameId: string): Promise<FullGame> {
  const game = await db.game.findUnique({
    where: { id: gameId },
    include: FULL_GAME_INCLUDE,
  });

  if (!game) {
    throw new Error(`Game not found: ${gameId}`);
  }

  return game as FullGame;
}

/**
 * Fetch a full game by ID, also returning the requesting player's power.
 * Throws if game is not found or the user is not a player.
 */
export async function getGameForPlayer(
  gameId: string,
  userId: string,
): Promise<FullGame & { myPower: PowerName }> {
  const game = await getGame(gameId);

  const myPlayer = game.players.find((p) => p.userId === userId);
  if (!myPlayer) {
    throw new Error(`User ${userId} is not a player in game ${gameId}`);
  }

  return { ...game, myPower: myPlayer.power as PowerName };
}

/**
 * List all games a user participates in (any status), most recently updated
 * first.
 */
export async function listGamesForUser(userId: string): Promise<GameWithPlayers[]> {
  return db.game.findMany({
    where: { players: { some: { userId } } },
    include: {
      players: {
        include: { user: { select: { id: true, username: true, email: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  }) as unknown as GameWithPlayers[];
}

/**
 * List open LOBBY games the user has NOT yet joined (so they can discover and
 * join them from the lobby screen).
 */
export async function listOpenGames(userId: string): Promise<GameWithPlayers[]> {
  return db.game.findMany({
    where: {
      status: GameStatus.LOBBY,
      players: { none: { userId } },
    },
    include: {
      players: {
        include: { user: { select: { id: true, username: true, email: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  }) as unknown as GameWithPlayers[];
}

// ─── Serializers ──────────────────────────────────────────────────────────────

/**
 * Maps a FullGame Prisma record to the frontend-expected GameState shape.
 * Renames fields, merges territory mapData, and derives activeCombats and
 * pendingPurchases.
 */
export function serializeGameState(game: FullGame) {
  const territoriesMap = new Map(TERRITORIES.map((t) => [t.key, t]));

  const territories = game.territories.map((t) => {
    const meta = territoriesMap.get(t.territoryKey);
    return {
      key: t.territoryKey,
      name: meta?.name ?? t.territoryKey,
      controller: t.controlledBy ?? null,
      ipcValue: meta?.ipcValue ?? 0,
      hasFactory: meta?.hasFactory ?? false,
      type: meta?.type ?? "LAND",
      adjacencies: meta?.adjacencies ?? [],
    };
  });

  const players = game.players.map((p) => ({
    userId: p.userId,
    username: p.user.username,
    power: p.power,
    ipc: p.ipcBalance,
    isReady: p.isReady,
  }));

  const units = game.units.map((u) => ({
    id: u.id,
    type: u.type,
    power: u.power,
    territoryKey: u.territoryKey,
    isDisabled: u.isDisabled,
  }));

  // Derive activeCombats: territories with units from multiple powers during CONDUCT_COMBAT
  const activeCombats: Array<{
    territory: string;
    attackingPower: string;
    defendingPower: string | null;
    attackerUnitIds: string[];
    defenderUnitIds: string[];
    round: number;
    log: string[];
  }> = [];

  if (game.activePhase === TurnPhase.CONDUCT_COMBAT) {
    const byTerritory = new Map<string, typeof game.units>();
    for (const unit of game.units) {
      const arr = byTerritory.get(unit.territoryKey) ?? [];
      arr.push(unit);
      byTerritory.set(unit.territoryKey, arr);
    }
    for (const [territory, unitsHere] of byTerritory) {
      const powers = new Set(unitsHere.map((u) => u.power));
      if (powers.size > 1) {
        const attackerUnits = unitsHere.filter((u) => u.power === game.activePower);
        const defenderUnits = unitsHere.filter((u) => u.power !== game.activePower);
        const lastEvent = game.combatEvents
          .filter((e) => e.territoryKey === territory)
          .slice(-1)[0];
        activeCombats.push({
          territory,
          attackingPower: game.activePower,
          defendingPower: defenderUnits[0]?.power ?? null,
          attackerUnitIds: attackerUnits.map((u) => u.id),
          defenderUnitIds: defenderUnits.map((u) => u.id),
          round: lastEvent ? lastEvent.combatRound + 1 : 1,
          log: [],
        });
      }
    }
  }

  // Derive pendingPurchases from the PURCHASE_UNITS turn for the current round/power
  const purchaseTurn = game.turns.find(
    (t) =>
      t.roundNumber === game.currentRound &&
      t.power === game.activePower &&
      t.phase === TurnPhase.PURCHASE_UNITS,
  );
  type PurchaseEntry = {
    type: string;
    purchases: Array<{ type: string; quantity: number }>;
  };
  const pendingPurchases: Array<{ type: string; quantity: number }> = [];
  if (purchaseTurn && Array.isArray(purchaseTurn.actionLog)) {
    for (const entry of purchaseTurn.actionLog as PurchaseEntry[]) {
      if (entry.type === "PURCHASE" && Array.isArray(entry.purchases)) {
        for (const p of entry.purchases) {
          pendingPurchases.push({ type: p.type, quantity: p.quantity });
        }
      }
    }
  }

  return {
    id: game.id,
    name: game.name,
    status: game.status,
    round: game.currentRound,
    activePower: game.activePower,
    currentPhase: game.activePhase,
    players,
    units,
    territories,
    activeCombats,
    pendingPurchases,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}

/**
 * Maps a Game+players record to the frontend-expected GameSummary shape.
 */
export function serializeGameSummary(game: GameWithPlayers) {
  return {
    id: game.id,
    name: game.name,
    status: game.status,
    round: game.currentRound,
    activePower: game.activePower,
    currentPhase: game.activePhase,
    players: game.players.map((p) => ({
      userId: p.userId,
      username: p.user.username,
      power: p.power,
      ipc: p.ipcBalance,
      isReady: p.isReady,
    })),
    createdAt: game.createdAt.toISOString(),
  };
}

/**
 * Add a player to a LOBBY-status game.
 *
 * - Ensures the power is not already taken.
 * - Ensures the user isn't already in the game.
 * - Sets the initial IPC balance for the power.
 */
export async function joinGame(
  gameId: string,
  userId: string,
  power: PowerName,
): Promise<GamePlayer> {
  const game = await db.game.findUnique({
    where: { id: gameId },
    include: { players: true },
  });

  if (!game) throw new Error(`Game not found: ${gameId}`);
  if (game.status !== GameStatus.LOBBY) {
    throw new Error("Cannot join a game that is not in LOBBY status");
  }

  const alreadyJoined = game.players.some((p) => p.userId === userId);
  if (alreadyJoined) throw new Error("You are already in this game");

  const powerTaken = game.players.some((p) => p.power === power);
  if (powerTaken) throw new Error(`Power ${power} is already taken`);

  const startingIpc =
    STARTING_IPC[power] ?? 0;

  return db.gamePlayer.create({
    data: {
      gameId,
      userId,
      power,
      isReady: false,
      ipcBalance: startingIpc,
    },
  });
}

/**
 * Mark a player as ready. When ALL players (minimum 2) are ready, start the
 * game: set status to ACTIVE and create the first Turn record.
 */
export async function setPlayerReady(
  gameId: string,
  userId: string,
): Promise<void> {
  const game = await db.game.findUnique({
    where: { id: gameId },
    include: { players: true },
  });

  if (!game) throw new Error(`Game not found: ${gameId}`);
  if (game.status !== GameStatus.LOBBY) {
    throw new Error("Game is not in LOBBY status");
  }

  const player = game.players.find((p) => p.userId === userId);
  if (!player) throw new Error("You are not a player in this game");

  // Mark this player ready
  await db.gamePlayer.update({
    where: { id: player.id },
    data: { isReady: true },
  });

  // Re-fetch updated list to check if all are ready
  const updatedPlayers = await db.gamePlayer.findMany({
    where: { gameId },
  });

  const allReady = updatedPlayers.length >= 2 && updatedPlayers.every((p) => p.isReady);

  if (allReady) {
    // Start the game — determine first active power from player list
    const firstPower = PowerName.USSR;

    await db.$transaction([
      db.game.update({
        where: { id: gameId },
        data: {
          status: GameStatus.ACTIVE,
          activePower: firstPower,
          activePhase: TurnPhase.PURCHASE_UNITS,
          currentRound: 1,
        },
      }),
      db.turn.create({
        data: {
          gameId,
          roundNumber: 1,
          power: firstPower,
          phase: TurnPhase.PURCHASE_UNITS,
          actionLog: [],
        },
      }),
    ]);
  }
}

/**
 * Advance the game to the next phase/power/round.
 *
 * Uses the shared `advanceTurn` state-machine function. Creates a new Turn
 * record for the incoming phase. Returns the new power, phase, and round.
 */
export async function advancePhase(gameId: string): Promise<{
  power: PowerName;
  phase: TurnPhase;
  round: number;
}> {
  const game = await db.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      status: true,
      activePower: true,
      activePhase: true,
      currentRound: true,
    },
  });

  if (!game) throw new Error(`Game not found: ${gameId}`);
  if (game.status !== GameStatus.ACTIVE) {
    throw new Error("Game is not active");
  }

  const result = advanceTurn(
    game.activePower as PowerName,
    game.activePhase as TurnPhase,
  );

  const newRound = result.newRound
    ? game.currentRound + 1
    : game.currentRound;

  await db.$transaction([
    // Mark current active turn as completed
    db.turn.updateMany({
      where: {
        gameId,
        power: game.activePower,
        phase: game.activePhase,
        completedAt: null,
      },
      data: { completedAt: new Date() },
    }),
    // Advance the game state
    db.game.update({
      where: { id: gameId },
      data: {
        activePower: result.power,
        activePhase: result.phase,
        currentRound: newRound,
      },
    }),
    // Create the new Turn record
    db.turn.create({
      data: {
        gameId,
        roundNumber: newRound,
        power: result.power,
        phase: result.phase,
        actionLog: [],
      },
    }),
  ]);

  return {
    power: result.power,
    phase: result.phase,
    round: newRound,
  };
}

/**
 * Get the current (non-completed) Turn for a game.
 */
export async function getCurrentTurn(gameId: string): Promise<Turn | null> {
  return db.turn.findFirst({
    where: { gameId, completedAt: null },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Validate that the requesting user is the active player for the current
 * game phase. Throws a descriptive error if not.
 */
export async function assertActivePlayer(
  gameId: string,
  userId: string,
): Promise<{ player: GamePlayer; game: Game }> {
  const game = await db.game.findUnique({
    where: { id: gameId },
    include: { players: true },
  });

  if (!game) throw new Error(`Game not found: ${gameId}`);
  if (game.status !== GameStatus.ACTIVE) {
    throw new Error("Game is not active");
  }

  const player = (game.players as GamePlayer[]).find(
    (p) => p.userId === userId && p.power === game.activePower,
  );

  if (!player) {
    throw new Error("It is not your turn");
  }

  return { player, game };
}
