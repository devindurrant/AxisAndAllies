/**
 * Database seed script.
 *
 * Creates two test users and an optional test game in LOBBY status.
 * Run with: pnpm --filter server db:seed
 */

import { PrismaClient, GameStatus, PowerName, TurnPhase } from "@prisma/client";
import bcrypt from "bcrypt";
import { TERRITORIES, STARTING_UNITS, STARTING_IPC } from "@aa/shared";

const db = new PrismaClient();

async function main(): Promise<void> {
  console.log("Seeding database...");

  // ── Create test users ──────────────────────────────────────────────────────

  const password1Hash = await bcrypt.hash("password123", 12);
  const password2Hash = await bcrypt.hash("password123", 12);

  const player1 = await db.user.upsert({
    where: { email: "player1@test.com" },
    update: {},
    create: {
      username: "player1",
      email: "player1@test.com",
      passwordHash: password1Hash,
    },
  });

  const player2 = await db.user.upsert({
    where: { email: "player2@test.com" },
    update: {},
    create: {
      username: "player2",
      email: "player2@test.com",
      passwordHash: password2Hash,
    },
  });

  console.log(`Created users: ${player1.username}, ${player2.username}`);

  // ── Create a test game ─────────────────────────────────────────────────────

  // Remove any existing test game to keep the seed idempotent
  await db.game.deleteMany({ where: { name: "Test Game" } });

  // Seed territory state
  const territorySeeds = TERRITORIES.map((t) => ({
    territoryKey: t.key,
    controlledBy: t.startingController ?? undefined,
  }));

  // Seed starting units (expand by quantity)
  const unitSeeds: Array<{
    territoryKey: string;
    power: PowerName;
    type: string;
    isDisabled: boolean;
    hasMoved: boolean;
  }> = [];

  for (const su of STARTING_UNITS) {
    for (let i = 0; i < su.quantity; i++) {
      unitSeeds.push({
        territoryKey: su.territoryKey,
        power: su.power as PowerName,
        type: su.type,
        isDisabled: false,
        hasMoved: false,
      });
    }
  }

  const testGame = await db.game.create({
    data: {
      name: "Test Game",
      status: GameStatus.LOBBY,
      currentRound: 1,
      activePower: PowerName.USSR,
      activePhase: TurnPhase.PURCHASE_UNITS,
      players: {
        createMany: {
          data: [
            {
              userId: player1.id,
              power: PowerName.USSR,
              isReady: false,
              ipcBalance: STARTING_IPC[PowerName.USSR],
            },
            {
              userId: player2.id,
              power: PowerName.GERMANY,
              isReady: false,
              ipcBalance: STARTING_IPC[PowerName.GERMANY],
            },
          ],
        },
      },
      territories: {
        createMany: { data: territorySeeds },
      },
      units: {
        createMany: {
          data: unitSeeds as Array<{
            territoryKey: string;
            power: PowerName;
            type: string;
            isDisabled: boolean;
            hasMoved: boolean;
          }>,
        },
      },
    },
  });

  console.log(`Created test game: ${testGame.id} (${testGame.name})`);
  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
