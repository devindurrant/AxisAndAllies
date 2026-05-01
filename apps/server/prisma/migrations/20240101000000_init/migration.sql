-- CreateEnum
CREATE TYPE "PowerName" AS ENUM ('USSR', 'GERMANY', 'UK', 'JAPAN', 'USA');

-- CreateEnum
CREATE TYPE "TurnPhase" AS ENUM ('PURCHASE_UNITS', 'COMBAT_MOVE', 'CONDUCT_COMBAT', 'NONCOMBAT_MOVE', 'MOBILIZE_UNITS', 'COLLECT_INCOME');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('INFANTRY', 'ARTILLERY', 'TANK', 'FIGHTER', 'BOMBER', 'SUBMARINE', 'DESTROYER', 'CARRIER', 'BATTLESHIP', 'AA_GUN', 'INDUSTRIAL_COMPLEX', 'TRANSPORT');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('LOBBY', 'ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'LOBBY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "activePower" "PowerName" NOT NULL DEFAULT 'USSR',
    "activePhase" "TurnPhase" NOT NULL DEFAULT 'PURCHASE_UNITS',

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePlayer" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "power" "PowerName" NOT NULL,
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "ipcBalance" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GamePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerritoryState" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "territoryKey" TEXT NOT NULL,
    "controlledBy" "PowerName",

    CONSTRAINT "TerritoryState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "territoryKey" TEXT NOT NULL,
    "power" "PowerName" NOT NULL,
    "type" "UnitType" NOT NULL,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "hasMoved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "power" "PowerName" NOT NULL,
    "phase" "TurnPhase" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "actionLog" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CombatEvent" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "territoryKey" TEXT NOT NULL,
    "attackingPower" "PowerName" NOT NULL,
    "defendingPower" "PowerName" NOT NULL,
    "combatRound" INTEGER NOT NULL,
    "attackDice" INTEGER[],
    "defenseDice" INTEGER[],
    "attackHits" INTEGER NOT NULL,
    "defenseHits" INTEGER NOT NULL,
    "unitsLost" JSONB NOT NULL,

    CONSTRAINT "CombatEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_gameId_userId_key" ON "GamePlayer"("gameId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_gameId_power_key" ON "GamePlayer"("gameId", "power");

-- CreateIndex
CREATE UNIQUE INDEX "TerritoryState_gameId_territoryKey_key" ON "TerritoryState"("gameId", "territoryKey");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayer" ADD CONSTRAINT "GamePlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerritoryState" ADD CONSTRAINT "TerritoryState_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombatEvent" ADD CONSTRAINT "CombatEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
