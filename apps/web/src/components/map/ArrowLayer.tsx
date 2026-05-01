import { Layer, Arrow, Group, Circle } from 'react-konva'
import { useGameStore } from '../../store/gameStore.ts'
import { TERRITORY_GRID, GRID_CELL_WIDTH, GRID_CELL_HEIGHT, MAP_PADDING } from './mapLayout.ts'

function getTerritoryCenter(key: string): { x: number; y: number } | null {
  const pos = TERRITORY_GRID[key]
  if (!pos) return null
  const [col, row] = pos
  return {
    x: MAP_PADDING + col * GRID_CELL_WIDTH + GRID_CELL_WIDTH / 2,
    y: MAP_PADDING + row * GRID_CELL_HEIGHT + GRID_CELL_HEIGHT / 2,
  }
}

export default function ArrowLayer() {
  const pendingMoves = useGameStore((s) => s.pendingMoves)

  return (
    <Layer listening={false}>
      {pendingMoves.map((move) => {
        const from = getTerritoryCenter(move.fromTerritory)
        const to = getTerritoryCenter(move.toTerritory)

        if (!from || !to) return null

        const dx = to.x - from.x
        const dy = to.y - from.y
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len === 0) return null

        return (
          <Group key={move.unitId}>
            {/* Origin dot */}
            <Circle
              x={from.x}
              y={from.y}
              radius={4}
              fill="#ffdd00"
              opacity={0.8}
            />
            {/* Arrow */}
            <Arrow
              points={[from.x, from.y, to.x, to.y]}
              stroke="#ffdd00"
              strokeWidth={2}
              fill="#ffdd00"
              pointerLength={8}
              pointerWidth={6}
              opacity={0.75}
              dash={[6, 3]}
            />
          </Group>
        )
      })}
    </Layer>
  )
}
