import { useCallback } from 'react'
import { Layer, Rect, Text, Group } from 'react-konva'
import { TerritoryType } from '@aa/shared'
import { useGameStore } from '../../store/gameStore.ts'
import { fillForController, strokeForController } from './powerColors.ts'
import {
  TERRITORY_GRID,
  GRID_CELL_WIDTH,
  GRID_CELL_HEIGHT,
  MAP_PADDING,
} from './mapLayout.ts'
import type { GameState, TerritoryState } from '../../types.ts'

interface TerritoryLayerProps {
  game: GameState
}

const CELL_PAD = 2

export default function TerritoryLayer({ game }: TerritoryLayerProps) {
  const selectedTerritory = useGameStore((s) => s.selectedTerritory)
  const setSelectedTerritory = useGameStore((s) => s.setSelectedTerritory)
  const activeCombatTerritory = useGameStore((s) => s.activeCombatTerritory)
  const setActiveCombatTerritory = useGameStore((s) => s.setActiveCombatTerritory)

  // Build a quick lookup from key → live state
  const stateByKey = new Map<string, TerritoryState>(
    game.territories.map((t) => [t.key, t]),
  )

  const handleClick = useCallback(
    (key: string) => {
      setSelectedTerritory(key === selectedTerritory ? null : key)

      // If this territory has active combat, open the combat modal
      const hasCombat = game.activeCombats.some((c) => c.territory === key)
      if (hasCombat) {
        setActiveCombatTerritory(key)
      }
    },
    [selectedTerritory, game.activeCombats, setSelectedTerritory, setActiveCombatTerritory],
  )

  return (
    <Layer>
      {Array.from(stateByKey.entries()).map(([key, territory]) => {
        const gridPos = TERRITORY_GRID[key]
        if (!gridPos) return null

        const [col, row] = gridPos
        const x = MAP_PADDING + col * GRID_CELL_WIDTH
        const y = MAP_PADDING + row * GRID_CELL_HEIGHT
        const w = GRID_CELL_WIDTH - CELL_PAD * 2
        const h = GRID_CELL_HEIGHT - CELL_PAD * 2

        const isSea = territory.type === TerritoryType.SEA
        const isSelected = key === selectedTerritory
        const hasCombat = game.activeCombats.some((c) => c.territory === key)
        const isActiveCombat = key === activeCombatTerritory

        const fill = isSea
          ? '#0d2b4a'
          : fillForController(territory.controller)
        const stroke = isSelected
          ? '#ffffff'
          : isActiveCombat
          ? '#ffdd00'
          : hasCombat
          ? '#ff6600'
          : strokeForController(territory.controller)
        const strokeWidth = isSelected || isActiveCombat ? 2 : hasCombat ? 1.5 : 1

        // Short display name (truncated)
        const shortName = territory.name.length > 10 ? territory.name.slice(0, 9) + '…' : territory.name

        return (
          <Group
            key={key}
            x={x + CELL_PAD}
            y={y + CELL_PAD}
            onClick={() => handleClick(key)}
            onTap={() => handleClick(key)}
          >
            <Rect
              width={w}
              height={h}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              cornerRadius={isSea ? 0 : 3}
              shadowColor={isSelected ? '#ffffff' : hasCombat ? '#ff4400' : undefined}
              shadowBlur={isSelected ? 8 : hasCombat ? 5 : 0}
              shadowOpacity={0.6}
            />
            {/* Territory name */}
            {!isSea && (
              <Text
                text={shortName}
                x={2}
                y={2}
                width={w - 4}
                fontSize={7}
                fill="#e0e0e0"
                align="center"
                fontFamily="system-ui, sans-serif"
                listening={false}
              />
            )}
            {/* IPC value */}
            {!isSea && territory.ipcValue > 0 && (
              <Text
                text={String(territory.ipcValue)}
                x={2}
                y={h - 11}
                width={w - 4}
                fontSize={8}
                fill="#ffdd66"
                align="right"
                fontFamily="system-ui, sans-serif"
                fontStyle="bold"
                listening={false}
              />
            )}
            {/* Combat indicator */}
            {hasCombat && (
              <Text
                text="⚔"
                x={0}
                y={h / 2 - 6}
                width={w}
                fontSize={11}
                fill="#ff6600"
                align="center"
                listening={false}
              />
            )}
            {/* Factory indicator */}
            {territory.hasFactory && !isSea && (
              <Text
                text="🏭"
                x={2}
                y={h - 12}
                fontSize={9}
                listening={false}
              />
            )}
          </Group>
        )
      })}
    </Layer>
  )
}
