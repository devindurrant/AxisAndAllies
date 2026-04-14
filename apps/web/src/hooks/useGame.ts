import { useQuery } from '@tanstack/react-query'
import { getGame } from '../api/games.ts'
import { useAuthStore } from '../store/authStore.ts'
import type { GameState, GamePlayer } from '../types.ts'

interface UseGameReturn {
  game: GameState | undefined
  isLoading: boolean
  refetch: () => void
  isMyTurn: boolean
  myPower: GamePlayer['power'] | null
  myIPC: number
}

export function useGame(id: string): UseGameReturn {
  const user = useAuthStore((s) => s.user)

  const { data: game, isLoading, refetch } = useQuery({
    queryKey: ['game', id],
    queryFn: () => getGame(id),
    refetchInterval: 30_000,
    enabled: Boolean(id),
  })

  const myPlayer = game?.players.find((p) => p.userId === user?.id) ?? null
  const myPower = myPlayer?.power ?? null
  const myIPC = myPlayer?.ipc ?? 0
  const isMyTurn = game !== undefined && myPower !== null && game.activePower === myPower

  return {
    game,
    isLoading,
    refetch: refetch as () => void,
    isMyTurn,
    myPower,
    myIPC,
  }
}
