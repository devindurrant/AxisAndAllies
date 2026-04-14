import { useCallback } from 'react'
import { Layer, Group, Circle, Text } from 'react-konva'
import { TurnPhase } from '@aa/shared'
import { useGameStore } from '../../store/gameStore.ts'
import { useAuthStore } from '../../store/authStore.ts'
import { POWER_STROKE_COLORS, POWER_FILL_COLORS } from './powerColors.ts'
import {
  TERRITORY_GRID,
  GRID_CELL_WIDTH,
  GRID_CELL_HEIGHT,
  MAP_PADDING,
} from './mapLayout.ts'
import type { GameState, GameUnit } from '../../types.ts'
import type { UnitType } from '../../types.ts'

interface UnitLayerProps {
  game: GameState
}

const UNIT_ABBREV: Record<UnitType, string> = {
  INFANTRY:          'INF',
  ARTILLERY:         'ART',
  TANK:              'TNK',
  FIGHTER:           'FTR',
  BOMBER:            'BMB',
  SUBMARINE:         'SUB',
  DESTROYER:         'DES',
  CARRIER:           'CAR',
  BATTLESHIP:        'BSH',
  AA_GUN:            'AAG',
  INDUSTRIAL_COMPLEX:'IC',
  TRANSPORT:         'TRN',
}

const CELL_PAD = 2
const UNIT_RADIUS = 8
const STACK_OFFSET = 4

function getTerritoryCenter(key: string): { x: number; y: number } | null {
  const pos = TERRITORY_GRID[key]
  if (!pos) return null
  const [col, row] = pos
  return {
    x: MAP_PADDING + col * GRID_CELL_WIDTH + GRID_CELL_WIDTH / 2,
    y: MAP_PADDING + row * GRID_CELL_HEIGHT + GRID_CELL_HEIGHT / 2,
  }
}

export default function UnitLayer({ game }: UnitLayerProps) {
  const user = useAuthStore((s) => s.user)
  const selectedUnitIds = useGameStore((s) => s.selectedUnitIds)
  const selectUnit = useGameStore((s) => s.selectUnit)
  const deselectUnit = useGameStore((s) => s.deselectUnit)

  const myPlayer = game.players.find((p) => p.userId === user?.id)
  const isMyTurn = myPlayer !== undefined && game.activePower === myPlayer.power
  const isSelectablePhase =
    game.currentPhase === TurnPhase.COMBAT_MOVE ||
    game.currentPhase === TurnPhase.NONCOMBAT_MOVE

  // Group units by territory
  const byTerritory = new Map<string, GameUnit[]>()
  for (const unit of game.units) {
    const list = byTerritory.get(unit.territoryKey) ?? []
    list.push(unit)
    byTerritory.set(unit.territoryKey, list)
  }

  const handleUnitClick = useCallback(
    (unit: GameUnit) => {
      if (!isMyTurn || !isSelectablePhase) return
      if (unit.power !== myPlayer?.power) return

      if (selectedUnitIds.includes(unit.id)) {
        deselectUnit(unit.id)
      } else {
        selectUnit(unit.id)
      }
    },
    [isMyTurn, isSelectablePhase, myPlayer, selectedUnitIds, selectUnit, deselectUnit],
  )

  return (
    <Layer>
      {Array.from(byTerritory.entries()).map(([territoryKey, units]) => {
        const center = getTerritoryCenter(territoryKey)
        if (!center) return null

        // Place units in a small grid within the territory cell
        const baseX = center.x - GRID_CELL_WIDTH / 2 + CELL_PAD + UNIT_RADIUS
        const baseY = center.y - GRID_CELL_HEIGHT / 2 + CELL_PAD + UNIT_RADIUS

        return units.map((unit, index) => {
          const col = index % 2
          const row = Math.floor(index / 2)
          const ux = baseX + col * (UNIT_RADIUS * 2 + 2)
          const uy = baseY + row * (UNIT_RADIUS * 2 + 1)

          const isSelected = selectedUnitIds.includes(unit.id)
          const isOwned = unit.power === myPlayer?.power
          const canSelect = isMyTurn && isSelectablePhase && isOwned

          const fillColor = POWER_FILL_COLORS[unit.power] ?? '#444'
          const strokeColor = isSelected
            ? '#ffffff'
            : POWER_STROKE_COLORS[unit.power] ?? '#888'

          return (
            <Group
              key={unit.id}
              x={ux}
              y={uy}
              onClick={() => handleUnitClick(unit)}
              onTap={() => handleUnitClick(unit)}
              listening={canSelect}
            >
              <Circle
                radius={UNIT_RADIUS}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={isSelected ? 2 : 1}
                shadowColor={isSelected ? '#ffffff' : undefined}
                shadowBlur={isSelected ? 6 : 0}
                shadowOpacity={0.8}
                opacity={unit.isDisabled ? 0.5 : 1}
              />
              <Text
                text={UNIT_ABBREV[unit.type]}
                x={-UNIT_RADIUS}
                y={-4}
                width={UNIT_RADIUS * 2}
                fontSize={5}
                fill="#ffffff"
                align="center"
                fontFamily="system-ui, sans-serif"
                fontStyle="bold"
                listening={false}
              />
            </Group>
          )
        })
      })}
    </Layer>
  )
}
