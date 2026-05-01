import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resolveCombatRound } from '../../api/games.ts'
import { UNIT_STATS } from '@aa/shared'
import Button from '../ui/Button.tsx'
import PowerBadge from '../ui/PowerBadge.tsx'
import DiceRoll from './DiceRoll.tsx'
import CombatLog from './CombatLog.tsx'
import type { GameState, GameUnit, CombatRoundResult } from '../../types.ts'
import type { PowerName } from '../../types.ts'

interface CombatModalProps {
  game: GameState
  gameId: string
  territory: string
  onClose: () => void
}

const UNIT_DISPLAY_NAMES: Record<string, string> = {
  INFANTRY: 'Infantry',
  ARTILLERY: 'Artillery',
  TANK: 'Tank',
  FIGHTER: 'Fighter',
  BOMBER: 'Bomber',
  SUBMARINE: 'Submarine',
  DESTROYER: 'Destroyer',
  CARRIER: 'Carrier',
  BATTLESHIP: 'Battleship',
  AA_GUN: 'AA Gun',
  INDUSTRIAL_COMPLEX: 'Factory',
  TRANSPORT: 'Transport',
}

export default function CombatModal({ game, gameId, territory, onClose }: CombatModalProps) {
  const queryClient = useQueryClient()
  const combat = game.activeCombats.find((c) => c.territory === territory)
  const territoryState = game.territories.find((t) => t.key === territory)

  const [roundResult, setRoundResult] = useState<CombatRoundResult | null>(null)
  const [selectedAttackerCasualties, setSelectedAttackerCasualties] = useState<string[]>([])
  const [selectedDefenderCasualties, setSelectedDefenderCasualties] = useState<string[]>([])
  const [localLog, setLocalLog] = useState<string[]>([])

  const { mutate: resolveRound, isPending } = useMutation({
    mutationFn: () =>
      resolveCombatRound(
        gameId,
        territory,
        selectedAttackerCasualties,
        selectedDefenderCasualties,
      ),
    onSuccess: (result) => {
      setRoundResult(result)
      setLocalLog((prev) => [...prev, ...result.log])
      setSelectedAttackerCasualties([])
      setSelectedDefenderCasualties([])
      queryClient.invalidateQueries({ queryKey: ['game', gameId] })
    },
  })

  if (!combat || !territoryState) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-[#16213e] rounded-xl p-8 border border-gray-700 text-center">
          <p className="text-gray-400">Combat data not found for {territory}.</p>
          <Button variant="ghost" onClick={onClose} className="mt-4">
            Close
          </Button>
        </div>
      </div>
    )
  }

  const attackerUnits: GameUnit[] = game.units.filter((u) =>
    combat.attackerUnitIds.includes(u.id),
  )
  const defenderUnits: GameUnit[] = game.units.filter((u) =>
    combat.defenderUnitIds.includes(u.id),
  )

  // Average attack threshold for display
  const avgAttackThreshold =
    attackerUnits.length > 0
      ? Math.round(
          attackerUnits.reduce((s, u) => s + UNIT_STATS[u.type].attack, 0) /
            attackerUnits.length,
        )
      : 1

  const avgDefenseThreshold =
    defenderUnits.length > 0
      ? Math.round(
          defenderUnits.reduce((s, u) => s + UNIT_STATS[u.type].defense, 0) /
            defenderUnits.length,
        )
      : 2

  const needsCasualtySelection =
    roundResult !== null &&
    (roundResult.attackerHits > 0 || roundResult.defenderHits > 0)

  function toggleAttackerCasualty(id: string) {
    setSelectedAttackerCasualties((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function toggleDefenderCasualty(id: string) {
    setSelectedDefenderCasualties((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const attackerHitsToAssign = roundResult?.defenderHits ?? 0
  const defenderHitsToAssign = roundResult?.attackerHits ?? 0

  const attackerCasualtiesOk = selectedAttackerCasualties.length === attackerHitsToAssign
  const defenderCasualtiesOk = selectedDefenderCasualties.length === defenderHitsToAssign
  const canAdvance = !needsCasualtySelection || (attackerCasualtiesOk && defenderCasualtiesOk)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#16213e] rounded-xl shadow-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-white">
              Combat: {territoryState.name}
            </h2>
            <p className="text-sm text-gray-400">Round {combat.round}</p>
          </div>
          <div className="flex items-center gap-3">
            <PowerBadge power={combat.attackingPower as PowerName} />
            <span className="text-gray-500 font-bold">vs</span>
            {combat.defendingPower && <PowerBadge power={combat.defendingPower as PowerName} />}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Units comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Attackers */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
                Attackers ({attackerUnits.length})
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {attackerUnits.map((unit) => {
                  const isCasualtySelected = selectedAttackerCasualties.includes(unit.id)
                  const wasKilled = roundResult?.attackerCasualties.some((c) => c.id === unit.id)
                  return (
                    <div
                      key={unit.id}
                      onClick={() =>
                        needsCasualtySelection && toggleAttackerCasualty(unit.id)
                      }
                      className={`text-xs px-2 py-1 rounded flex items-center justify-between transition cursor-pointer ${
                        wasKilled
                          ? 'bg-red-900/40 line-through text-gray-600'
                          : isCasualtySelected
                          ? 'bg-red-700/50 text-red-200 ring-1 ring-red-500'
                          : needsCasualtySelection && attackerHitsToAssign > 0
                          ? 'bg-gray-800/60 hover:bg-red-900/30 text-gray-200'
                          : 'bg-gray-800/40 text-gray-300'
                      }`}
                    >
                      <span>{UNIT_DISPLAY_NAMES[unit.type] ?? unit.type}</span>
                      <span className="text-gray-500">A:{UNIT_STATS[unit.type].attack}</span>
                    </div>
                  )
                })}
              </div>
              {needsCasualtySelection && attackerHitsToAssign > 0 && (
                <p className="text-xs text-yellow-400 mt-1">
                  Select {attackerHitsToAssign - selectedAttackerCasualties.length} more{' '}
                  attacker casualt{attackerHitsToAssign > 1 ? 'ies' : 'y'}
                </p>
              )}
            </div>

            {/* Defenders */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
                Defenders ({defenderUnits.length})
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {defenderUnits.map((unit) => {
                  const isCasualtySelected = selectedDefenderCasualties.includes(unit.id)
                  const wasKilled = roundResult?.defenderCasualties.some((c) => c.id === unit.id)
                  return (
                    <div
                      key={unit.id}
                      onClick={() =>
                        needsCasualtySelection && toggleDefenderCasualty(unit.id)
                      }
                      className={`text-xs px-2 py-1 rounded flex items-center justify-between transition cursor-pointer ${
                        wasKilled
                          ? 'bg-red-900/40 line-through text-gray-600'
                          : isCasualtySelected
                          ? 'bg-red-700/50 text-red-200 ring-1 ring-red-500'
                          : needsCasualtySelection && defenderHitsToAssign > 0
                          ? 'bg-gray-800/60 hover:bg-red-900/30 text-gray-200'
                          : 'bg-gray-800/40 text-gray-300'
                      }`}
                    >
                      <span>{UNIT_DISPLAY_NAMES[unit.type] ?? unit.type}</span>
                      <span className="text-gray-500">D:{UNIT_STATS[unit.type].defense}</span>
                    </div>
                  )
                })}
              </div>
              {needsCasualtySelection && defenderHitsToAssign > 0 && (
                <p className="text-xs text-yellow-400 mt-1">
                  Select {defenderHitsToAssign - selectedDefenderCasualties.length} more{' '}
                  defender casualt{defenderHitsToAssign > 1 ? 'ies' : 'y'}
                </p>
              )}
            </div>
          </div>

          {/* Dice Results */}
          {roundResult && (
            <div className="space-y-4">
              <DiceRoll
                rolls={roundResult.attackerRolls}
                hitThreshold={avgAttackThreshold}
                label={`Attacker rolls — ${roundResult.attackerHits} hits`}
              />
              <DiceRoll
                rolls={roundResult.defenderRolls}
                hitThreshold={avgDefenseThreshold}
                label={`Defender rolls — ${roundResult.defenderHits} hits`}
              />
            </div>
          )}

          {/* Combat Log */}
          <CombatLog entries={localLog.length > 0 ? localLog : combat.log} />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between gap-3">
          <Button variant="danger" size="sm" onClick={onClose}>
            Retreat / Close
          </Button>

          <div className="flex gap-2">
            {needsCasualtySelection ? (
              <Button
                variant="primary"
                size="sm"
                disabled={!canAdvance}
                isLoading={isPending}
                onClick={() => resolveRound()}
              >
                Apply Casualties & Continue
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                isLoading={isPending}
                onClick={() => resolveRound()}
              >
                Roll Dice
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
