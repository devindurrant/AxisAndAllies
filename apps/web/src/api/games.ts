import apiClient from './client.ts'
import type {
  GameSummary,
  Game,
  GameState,
  CombatRoundResult,
} from '../types.ts'
import type { PowerName, UnitType } from '../types.ts'

export async function listGames(): Promise<GameSummary[]> {
  const { data } = await apiClient.get<{ games: GameSummary[] }>('/games')
  return data.games
}

export async function createGame(name: string, power: PowerName): Promise<Game> {
  const { data } = await apiClient.post<{ game: Game }>('/games', { name, power })
  return data.game
}

export async function getGame(id: string): Promise<GameState> {
  const { data } = await apiClient.get<{ game: GameState }>(`/games/${id}`)
  return data.game
}

export async function joinGame(id: string, power: PowerName): Promise<void> {
  await apiClient.post(`/games/${id}/join`, { power })
}

export async function setReady(id: string): Promise<void> {
  await apiClient.post(`/games/${id}/ready`)
}

export async function submitPurchase(
  id: string,
  purchases: { type: UnitType; quantity: number }[],
): Promise<void> {
  await apiClient.post(`/games/${id}/phases/purchase`, { purchases })
}

export async function submitCombatMoves(
  id: string,
  moves: { unitId: string; toTerritory: string }[],
): Promise<void> {
  await apiClient.post(`/games/${id}/phases/combat-move`, { moves })
}

export async function resolveCombatRound(
  id: string,
  territory: string,
  attackerCasualties: string[],
  defenderCasualties: string[],
): Promise<CombatRoundResult> {
  const { data } = await apiClient.post<CombatRoundResult>(
    `/games/${id}/phases/combat/resolve`,
    { territory, attackerCasualties, defenderCasualties },
  )
  return data
}

export async function submitNoncombatMoves(
  id: string,
  moves: { unitId: string; toTerritory: string }[],
): Promise<void> {
  await apiClient.post(`/games/${id}/phases/noncombat-move`, { moves })
}

export async function submitMobilize(
  id: string,
  placements: { type: UnitType; territoryKey: string }[],
): Promise<void> {
  await apiClient.post(`/games/${id}/phases/mobilize`, { placements })
}

export async function collectIncome(id: string): Promise<void> {
  await apiClient.post(`/games/${id}/phases/collect-income`)
}

export async function nextPhase(id: string): Promise<void> {
  await apiClient.post(`/games/${id}/next-phase`)
}
