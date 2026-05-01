import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { submitMobilize } from '../../api/games.ts'
import { UnitType } from '@aa/shared'
import Button from '../ui/Button.tsx'
import type { GameState } from '../../types.ts'
import type { PowerName } from '../../types.ts'

interface MobilizePanelProps {
  game: GameState
  gameId: string
}

const UNIT_DISPLAY_NAMES: Record<UnitType, string> = {
  [UnitType.INFANTRY]: 'Infantry',
  [UnitType.ARTILLERY]: 'Artillery',
  [UnitType.TANK]: 'Tank',
  [UnitType.FIGHTER]: 'Fighter',
  [UnitType.BOMBER]: 'Bomber',
  [UnitType.SUBMARINE]: 'Submarine',
  [UnitType.DESTROYER]: 'Destroyer',
  [UnitType.CARRIER]: 'Carrier',
  [UnitType.BATTLESHIP]: 'Battleship',
  [UnitType.AA_GUN]: 'AA Gun',
  [UnitType.INDUSTRIAL_COMPLEX]: 'Factory',
  [UnitType.TRANSPORT]: 'Transport',
}

interface PlacementAssignment {
  type: UnitType
  territoryKey: string
}

export default function MobilizePanel({ game, gameId }: MobilizePanelProps) {
  const queryClient = useQueryClient()

  // Get friendly factory territories for active power
  const factories = game.territories.filter(
    (t) =>
      t.hasFactory &&
      t.controller === (game.activePower as unknown as PowerName),
  )

  // Calculate how many units can still be placed per factory (= territory IPC value)
  function getFactoryCapacity(territoryKey: string): number {
    const territory = game.territories.find((t) => t.key === territoryKey)
    return territory?.ipcValue ?? 0
  }

  // Build pending placements list from game.pendingPurchases
  const pendingToBuy = game.pendingPurchases.flatMap((p) =>
    Array.from({ length: p.quantity }, (_, i) => ({
      id: `${p.type}-${i}`,
      type: p.type,
    })),
  )

  const [assignments, setAssignments] = useState<Record<string, string>>(() => {
    // Pre-assign to first available factory
    const initial: Record<string, string> = {}
    const firstFactory = factories[0]?.key ?? ''
    pendingToBuy.forEach((unit) => {
      initial[unit.id] = firstFactory
    })
    return initial
  })

  // Count placements per factory
  function countPlacedAt(territoryKey: string): number {
    return Object.values(assignments).filter((v) => v === territoryKey).length
  }

  const allAssigned = pendingToBuy.every(
    (unit) => assignments[unit.id] && assignments[unit.id] !== '',
  )

  const overCapacity = factories.some(
    (f) => countPlacedAt(f.key) > getFactoryCapacity(f.key),
  )

  const { mutate, isPending, isError } = useMutation({
    mutationFn: () => {
      const placements: PlacementAssignment[] = pendingToBuy
        .filter((unit) => assignments[unit.id])
        .map((unit) => ({
          type: unit.type,
          territoryKey: assignments[unit.id],
        }))
      return submitMobilize(gameId, placements)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['game', gameId] })
    },
  })

  if (pendingToBuy.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic text-center py-4">
        No units to place this turn.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="font-medium text-sm text-white">Place Units</p>

      {factories.length === 0 && (
        <p className="text-red-400 text-xs">
          No factories available to place units.
        </p>
      )}

      {/* Unit Placement List */}
      <div className="space-y-2">
        {pendingToBuy.map((unit) => {
          const assigned = assignments[unit.id] ?? ''
          const factory = game.territories.find((t) => t.key === assigned)
          const capacity = factory ? getFactoryCapacity(factory.key) : 0
          const placed = assigned ? countPlacedAt(assigned) : 0
          const isAtCapacity = placed > capacity

          return (
            <div
              key={unit.id}
              className="flex items-center justify-between gap-2 bg-gray-800/40 rounded-lg px-3 py-2"
            >
              <span className="text-sm text-gray-200 flex-1">
                {UNIT_DISPLAY_NAMES[unit.type]}
              </span>
              <select
                value={assigned}
                onChange={(e) =>
                  setAssignments((prev) => ({ ...prev, [unit.id]: e.target.value }))
                }
                className={`text-xs px-2 py-1 rounded bg-[#0f3460] border text-white focus:outline-none ${
                  isAtCapacity ? 'border-red-500' : 'border-gray-600'
                }`}
              >
                <option value="">— select factory —</option>
                {factories.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.name} (cap: {getFactoryCapacity(f.key)})
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>

      {/* Factory capacity overview */}
      {factories.length > 0 && (
        <div className="text-xs space-y-1">
          {factories.map((f) => {
            const placed = countPlacedAt(f.key)
            const capacity = getFactoryCapacity(f.key)
            const over = placed > capacity
            return (
              <div key={f.key} className="flex justify-between items-center text-gray-400">
                <span>{f.name}</span>
                <span className={over ? 'text-red-400 font-medium' : ''}>
                  {placed}/{capacity}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {overCapacity && (
        <p className="text-red-400 text-xs">
          Placement exceeds factory capacity. Redistribute units.
        </p>
      )}

      <Button
        variant="primary"
        size="sm"
        className="w-full"
        disabled={!allAssigned || overCapacity || factories.length === 0}
        isLoading={isPending}
        onClick={() => mutate()}
      >
        Confirm Placement
      </Button>

      {isError && (
        <p className="text-red-400 text-xs text-center">
          Placement failed. Please try again.
        </p>
      )}
    </div>
  )
}
