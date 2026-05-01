import { useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGame } from '../hooks/useGame.ts'
import { useSocket } from '../hooks/useSocket.ts'
import { useGameStore } from '../store/gameStore.ts'
import Sidebar from '../components/layout/Sidebar.tsx'
import GameMap from '../components/map/GameMap.tsx'
import CombatModal from '../components/combat/CombatModal.tsx'
import type { CombatRoundResult } from '../types.ts'

export default function GamePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const activeCombatTerritory = useGameStore((s) => s.activeCombatTerritory)

  // All hooks must be called unconditionally — redirect handled via effect
  const gameId = id ?? ''
  const { game, isLoading, refetch } = useGame(gameId)

  const handleStateUpdated = useCallback(() => {
    refetch()
  }, [refetch])

  const handleYourTurn = useCallback(() => {
    refetch()
  }, [refetch])

  const handleCombatResult = useCallback(
    (_result: CombatRoundResult) => {
      refetch()
    },
    [refetch],
  )

  useSocket({
    gameId: gameId || undefined,
    onStateUpdated: handleStateUpdated,
    onYourTurn: handleYourTurn,
    onCombatResult: handleCombatResult,
  })

  useEffect(() => {
    if (!id) navigate('/lobby', { replace: true })
  }, [id, navigate])

  if (!id) return null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a2e]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-usa border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading game…</p>
        </div>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a2e]">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">Game not found.</p>
          <button
            onClick={() => navigate('/lobby')}
            className="text-usa hover:underline"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#1a1a2e]">
      {/* Left Sidebar */}
      <aside className="w-[280px] flex-shrink-0 bg-[#16213e] border-r border-gray-700 overflow-y-auto">
        <Sidebar game={game} gameId={id} />
      </aside>

      {/* Main Canvas Area */}
      <main className="flex-1 relative overflow-hidden">
        <GameMap game={game} />
      </main>

      {/* Combat Overlay */}
      {activeCombatTerritory && (
        <CombatModal
          game={game}
          gameId={id}
          territory={activeCombatTerritory}
          onClose={() => {
            useGameStore.getState().setActiveCombatTerritory(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}
