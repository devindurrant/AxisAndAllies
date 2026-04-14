import { useMutation, useQueryClient } from '@tanstack/react-query'
import { nextPhase } from '../../api/games.ts'
import { useAuthStore } from '../../store/authStore.ts'
import { useGameStore } from '../../store/gameStore.ts'
import { TURN_ORDER, PHASE_ORDER } from '@aa/shared'
import { TurnPhase } from '@aa/shared'
import PowerBadge from '../ui/PowerBadge.tsx'
import PhaseIndicator from '../phases/PhaseIndicator.tsx'
import PurchasePanel from '../phases/PurchasePanel.tsx'
import MobilizePanel from '../phases/MobilizePanel.tsx'
import Button from '../ui/Button.tsx'
import type { GameState, GamePlayer } from '../../types.ts'
import type { PowerName } from '../../types.ts'

const PHASE_DESCRIPTIONS: Record<TurnPhase, string> = {
  [TurnPhase.PURCHASE_UNITS]: 'Buy units for this turn.',
  [TurnPhase.COMBAT_MOVE]: 'Move units into hostile territories.',
  [TurnPhase.CONDUCT_COMBAT]: 'Resolve battles in contested territories.',
  [TurnPhase.NONCOMBAT_MOVE]: 'Move remaining units safely.',
  [TurnPhase.MOBILIZE_UNITS]: 'Place newly purchased units at factories.',
  [TurnPhase.COLLECT_INCOME]: 'Collect IPC income from controlled territories.',
}

const POWER_DOT_COLORS: Record<PowerName, string> = {
  USSR: 'bg-ussr',
  GERMANY: 'bg-germany',
  UK: 'bg-uk',
  JAPAN: 'bg-japan',
  USA: 'bg-usa',
}

interface SidebarProps {
  game: GameState
  gameId: string
}

export default function Sidebar({ game, gameId }: SidebarProps) {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const { clearPendingMoves, clearSelection } = useGameStore()

  const myPlayer = game.players.find((p) => p.userId === user?.id) as GamePlayer | undefined
  const isMyTurn = myPlayer !== undefined && game.activePower === myPlayer.power

  const nextPhaseMutation = useMutation({
    mutationFn: () => nextPhase(gameId),
    onSuccess: () => {
      clearPendingMoves()
      clearSelection()
      queryClient.invalidateQueries({ queryKey: ['game', gameId] })
    },
  })

  const phaseIndex = PHASE_ORDER.indexOf(game.currentPhase)
  const isLastPhase = phaseIndex === PHASE_ORDER.length - 1

  const canEndPhase =
    isMyTurn &&
    game.currentPhase !== TurnPhase.CONDUCT_COMBAT &&
    game.currentPhase !== TurnPhase.PURCHASE_UNITS &&
    game.currentPhase !== TurnPhase.MOBILIZE_UNITS

  return (
    <div className="flex flex-col h-full">
      {/* Game Title */}
      <div className="px-4 py-4 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          {game.name}
        </h2>
        <p className="text-lg font-bold text-white mt-0.5">Round {game.round}</p>
      </div>

      {/* Phase Indicator */}
      <div className="px-4 py-3 border-b border-gray-700">
        <PhaseIndicator currentPhase={game.currentPhase} />
      </div>

      {/* Active Power */}
      <div className="px-4 py-3 border-b border-gray-700">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Active Player</p>
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${POWER_DOT_COLORS[game.activePower]}`}
          />
          <PowerBadge power={game.activePower} size="md" />
          {isMyTurn && (
            <span className="text-xs bg-green-800 text-green-300 px-1.5 py-0.5 rounded font-medium">
              Your Turn
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {PHASE_DESCRIPTIONS[game.currentPhase]}
        </p>
      </div>

      {/* IPC Balance */}
      {myPlayer && (
        <div className="px-4 py-3 border-b border-gray-700">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Your IPC Balance</p>
          <p className="text-2xl font-bold text-yellow-300">
            {myPlayer.ipc}{' '}
            <span className="text-sm font-normal text-gray-400">IPC</span>
          </p>
        </div>
      )}

      {/* Turn Order */}
      <div className="px-4 py-3 border-b border-gray-700">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Turn Order</p>
        <div className="space-y-1.5">
          {TURN_ORDER.map((power) => {
            const player = game.players.find((p) => p.power === power)
            const isActive = power === game.activePower
            return (
              <div
                key={power}
                className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-sm ${
                  isActive ? 'bg-white/10 ring-1 ring-white/20' : 'opacity-60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${POWER_DOT_COLORS[power]}`} />
                  <PowerBadge power={power} size="sm" />
                </div>
                {player ? (
                  <span className="text-gray-300 text-xs truncate max-w-[80px]">
                    {player.username}
                  </span>
                ) : (
                  <span className="text-gray-600 text-xs italic">open</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Phase-specific Action Panel */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isMyTurn && game.currentPhase === TurnPhase.PURCHASE_UNITS && (
          <PurchasePanel game={game} gameId={gameId} myIPC={myPlayer?.ipc ?? 0} />
        )}
        {isMyTurn && game.currentPhase === TurnPhase.MOBILIZE_UNITS && (
          <MobilizePanel game={game} gameId={gameId} />
        )}
        {isMyTurn && game.currentPhase === TurnPhase.COMBAT_MOVE && (
          <div className="text-sm text-gray-300 space-y-2">
            <p className="font-medium">Combat Move</p>
            <p className="text-gray-400 text-xs">
              Click units on the map, then click a target territory to stage an attack.
              When ready, confirm below.
            </p>
          </div>
        )}
        {isMyTurn && game.currentPhase === TurnPhase.CONDUCT_COMBAT && (
          <div className="text-sm text-gray-300 space-y-2">
            <p className="font-medium">Conduct Combat</p>
            <p className="text-gray-400 text-xs">
              Click a contested territory on the map to open the combat resolution panel.
            </p>
            {game.activeCombats.length === 0 && (
              <p className="text-green-400 text-xs">No active combats — ready to advance.</p>
            )}
          </div>
        )}
        {isMyTurn && game.currentPhase === TurnPhase.NONCOMBAT_MOVE && (
          <div className="text-sm text-gray-300 space-y-2">
            <p className="font-medium">Non-Combat Move</p>
            <p className="text-gray-400 text-xs">
              Move remaining friendly units to safe territories.
            </p>
          </div>
        )}
        {isMyTurn && game.currentPhase === TurnPhase.COLLECT_INCOME && (
          <div className="text-sm text-gray-300 space-y-2">
            <p className="font-medium">Collect Income</p>
            <p className="text-gray-400 text-xs">
              Click "End Phase" to collect your IPC income and end your turn.
            </p>
          </div>
        )}
        {!isMyTurn && (
          <p className="text-gray-500 text-sm text-center mt-4">
            Waiting for <span className="text-gray-300">{game.activePower}</span>…
          </p>
        )}
      </div>

      {/* End Phase Button */}
      {isMyTurn && canEndPhase && (
        <div className="px-4 py-4 border-t border-gray-700">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            isLoading={nextPhaseMutation.isPending}
            onClick={() => nextPhaseMutation.mutate()}
          >
            {isLastPhase ? 'End Turn' : 'End Phase'}
          </Button>
          {nextPhaseMutation.isError && (
            <p className="text-red-400 text-xs mt-2 text-center">
              Failed to advance. Please try again.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
