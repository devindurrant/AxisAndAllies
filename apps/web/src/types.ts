/**
 * Shared frontend types for game state, mirroring server-side shapes.
 */

import type { PowerName, TurnPhase, UnitType, GameStatus, TerritoryType } from '@aa/shared'

export type { PowerName, TurnPhase, UnitType, GameStatus, TerritoryType }

export interface User {
  id: string
  username: string
  email: string
}

export interface GamePlayer {
  userId: string
  username: string
  power: PowerName
  ipc: number
  isReady: boolean
}

export interface GameUnit {
  id: string
  type: UnitType
  power: PowerName
  territoryKey: string
  isDisabled: boolean
}

export interface TerritoryState {
  key: string
  name: string
  controller: PowerName | null
  ipcValue: number
  hasFactory: boolean
  type: TerritoryType
  adjacencies: string[]
}

export interface ActiveCombat {
  territory: string
  attackingPower: PowerName
  defendingPower: PowerName | null
  attackerUnitIds: string[]
  defenderUnitIds: string[]
  round: number
  log: string[]
}

export interface GameState {
  id: string
  name: string
  status: GameStatus
  round: number
  activePower: PowerName
  currentPhase: TurnPhase
  players: GamePlayer[]
  units: GameUnit[]
  territories: TerritoryState[]
  activeCombats: ActiveCombat[]
  pendingPurchases: { type: UnitType; quantity: number }[]
  createdAt: string
  updatedAt: string
}

export interface GameSummary {
  id: string
  name: string
  status: GameStatus
  round: number
  activePower: PowerName
  currentPhase: TurnPhase
  players: GamePlayer[]
  createdAt: string
}

export interface Game {
  id: string
  name: string
  status: GameStatus
  createdAt: string
}

export interface CombatRoundResult {
  combatEventId: string
  attackerRolls: number[]
  defenderRolls: number[]
  attackerHits: number
  defenderHits: number
  attackerCasualties: { id: string; type: string | undefined }[]
  defenderCasualties: { id: string; type: string | undefined }[]
  remainingAttackers: number
  remainingDefenders: number
  attackerWins: boolean
  defenderWins: boolean
  territoryKey: string
  log: string[]
}
