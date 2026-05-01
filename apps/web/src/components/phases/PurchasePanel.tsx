import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { submitPurchase } from '../../api/games.ts'
import { UnitType, UNIT_STATS } from '@aa/shared'
import Button from '../ui/Button.tsx'
import type { GameState } from '../../types.ts'

interface PurchasePanelProps {
  game: GameState
  gameId: string
  myIPC: number
}

const PURCHASABLE_UNITS: UnitType[] = [
  UnitType.INFANTRY,
  UnitType.ARTILLERY,
  UnitType.TANK,
  UnitType.FIGHTER,
  UnitType.BOMBER,
  UnitType.SUBMARINE,
  UnitType.DESTROYER,
  UnitType.CARRIER,
  UnitType.BATTLESHIP,
  UnitType.AA_GUN,
  UnitType.INDUSTRIAL_COMPLEX,
  UnitType.TRANSPORT,
]

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

type QuantityMap = Partial<Record<UnitType, number>>

export default function PurchasePanel({ game, gameId, myIPC }: PurchasePanelProps) {
  const queryClient = useQueryClient()
  const [quantities, setQuantities] = useState<QuantityMap>({})

  const totalCost = PURCHASABLE_UNITS.reduce((sum, type) => {
    const qty = quantities[type] ?? 0
    return sum + qty * UNIT_STATS[type].cost
  }, 0)

  const isOverBudget = totalCost > myIPC
  const hasAnyPurchase = totalCost > 0

  const { mutate, isPending, isError } = useMutation({
    mutationFn: () => {
      const purchases = PURCHASABLE_UNITS.filter((t) => (quantities[t] ?? 0) > 0).map(
        (type) => ({ type, quantity: quantities[type]! }),
      )
      return submitPurchase(gameId, purchases)
    },
    onSuccess: () => {
      setQuantities({})
      queryClient.invalidateQueries({ queryKey: ['game', gameId] })
    },
  })

  function setQty(type: UnitType, delta: number) {
    setQuantities((prev) => {
      const current = prev[type] ?? 0
      const next = Math.max(0, current + delta)
      return { ...prev, [type]: next }
    })
  }

  return (
    <div className="space-y-3">
      <p className="font-medium text-sm text-white">Purchase Units</p>

      {/* Already pending purchases from server */}
      {game.pendingPurchases.length > 0 && (
        <div className="text-xs text-gray-400 bg-gray-800/50 rounded p-2">
          <p className="font-medium text-gray-300 mb-1">Already Purchased:</p>
          {game.pendingPurchases.map((p, i) => (
            <p key={i}>
              {p.quantity}× {UNIT_DISPLAY_NAMES[p.type]}
            </p>
          ))}
        </div>
      )}

      {/* Unit Table */}
      <div className="rounded-lg border border-gray-700 overflow-hidden text-xs">
        <table className="w-full">
          <thead className="bg-gray-800/60">
            <tr className="text-gray-400">
              <th className="text-left px-2 py-1.5">Unit</th>
              <th className="text-center px-1 py-1.5">A</th>
              <th className="text-center px-1 py-1.5">D</th>
              <th className="text-center px-1 py-1.5">M</th>
              <th className="text-center px-1 py-1.5">$</th>
              <th className="text-center px-2 py-1.5">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {PURCHASABLE_UNITS.map((type) => {
              const stats = UNIT_STATS[type]
              const qty = quantities[type] ?? 0
              const maxAffordable = Math.floor(myIPC / stats.cost)
              const remainingBudget = myIPC - totalCost
              const canBuyMore = remainingBudget >= stats.cost

              return (
                <tr key={type} className="hover:bg-white/5">
                  <td className="px-2 py-1.5 text-gray-200">{UNIT_DISPLAY_NAMES[type]}</td>
                  <td className="text-center px-1 py-1.5 text-gray-300">{stats.attack}</td>
                  <td className="text-center px-1 py-1.5 text-gray-300">{stats.defense}</td>
                  <td className="text-center px-1 py-1.5 text-gray-300">{stats.movement}</td>
                  <td className="text-center px-1 py-1.5 text-yellow-300 font-medium">
                    {stats.cost}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setQty(type, -1)}
                        disabled={qty === 0}
                        className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center justify-center leading-none"
                        aria-label={`Decrease ${UNIT_DISPLAY_NAMES[type]}`}
                      >
                        −
                      </button>
                      <span className="w-5 text-center font-medium text-white">{qty}</span>
                      <button
                        onClick={() => setQty(type, 1)}
                        disabled={!canBuyMore || qty >= maxAffordable + qty}
                        className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center justify-center leading-none"
                        aria-label={`Increase ${UNIT_DISPLAY_NAMES[type]}`}
                      >
                        +
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Cost Summary */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">Total Cost</span>
        <span className={`font-bold ${isOverBudget ? 'text-red-400' : 'text-yellow-300'}`}>
          {totalCost} / {myIPC} IPC
        </span>
      </div>
      {isOverBudget && (
        <p className="text-red-400 text-xs">Over budget by {totalCost - myIPC} IPC.</p>
      )}

      {/* Confirm Button */}
      <Button
        variant="primary"
        size="sm"
        className="w-full"
        disabled={isOverBudget || !hasAnyPurchase}
        isLoading={isPending}
        onClick={() => mutate()}
      >
        Confirm Purchase
      </Button>
      {isError && (
        <p className="text-red-400 text-xs text-center">Purchase failed. Please try again.</p>
      )}
    </div>
  )
}
