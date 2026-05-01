import { useRef, useState, useCallback, useEffect } from 'react'
import { Stage, Layer, Rect } from 'react-konva'
import type Konva from 'konva'
import TerritoryLayer from './TerritoryLayer.tsx'
import UnitLayer from './UnitLayer.tsx'
import ArrowLayer from './ArrowLayer.tsx'
import { GRID_CELL_WIDTH, GRID_CELL_HEIGHT, TERRITORY_GRID, MAP_PADDING } from './mapLayout.ts'
import type { GameState } from '../../types.ts'

interface GameMapProps {
  game: GameState
}

const MAX_COLS = Math.max(...Object.values(TERRITORY_GRID).map(([c]) => c)) + 2
const MAX_ROWS = Math.max(...Object.values(TERRITORY_GRID).map(([, r]) => r)) + 2
const LOGICAL_WIDTH = MAP_PADDING * 2 + MAX_COLS * GRID_CELL_WIDTH
const LOGICAL_HEIGHT = MAP_PADDING * 2 + MAX_ROWS * GRID_CELL_HEIGHT

const MIN_SCALE = 0.3
const MAX_SCALE = 3.0

export default function GameMap({ game }: GameMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const lastPointer = useRef<{ x: number; y: number } | null>(null)

  // Fit the map to the container on mount and resize
  useEffect(() => {
    function measure() {
      if (!containerRef.current) return
      const { clientWidth, clientHeight } = containerRef.current
      setDimensions({ width: clientWidth, height: clientHeight })
      // Fit-to-screen initial scale
      const fitScale = Math.min(
        clientWidth / LOGICAL_WIDTH,
        clientHeight / LOGICAL_HEIGHT,
        1,
      )
      setScale(fitScale)
      setPosition({ x: 0, y: 0 })
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return

    const oldScale = scale
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const direction = e.evt.deltaY < 0 ? 1 : -1
    const factor = 1.08
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, direction > 0 ? oldScale * factor : oldScale / factor))

    const mousePointTo = {
      x: (pointer.x - position.x) / oldScale,
      y: (pointer.y - position.y) / oldScale,
    }

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    }

    setScale(newScale)
    setPosition(newPos)
  }, [scale, position])

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // Only pan when clicking on the background (not on territories/units)
    if (e.target === e.target.getStage() || e.target.getClassName() === 'Rect') {
      const isBackground = e.target.name() === 'map-background'
      if (isBackground) {
        isPanning.current = true
        const pos = stageRef.current?.getPointerPosition()
        if (pos) lastPointer.current = pos
      }
    }
  }, [])

  const handleMouseMove = useCallback(() => {
    if (!isPanning.current || !stageRef.current) return
    const pos = stageRef.current.getPointerPosition()
    if (!pos || !lastPointer.current) return
    setPosition((prev) => ({
      x: prev.x + (pos.x - lastPointer.current!.x),
      y: prev.y + (pos.y - lastPointer.current!.y),
    }))
    lastPointer.current = pos
  }, [])

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
    lastPointer.current = null
  }, [])

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden bg-[#1a3a5c]">
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Background Layer */}
        <Layer>
          <Rect
            name="map-background"
            x={0}
            y={0}
            width={LOGICAL_WIDTH}
            height={LOGICAL_HEIGHT}
            fill="#1a3a5c"
            listening={true}
          />
        </Layer>

        {/* Territory Layer */}
        <TerritoryLayer game={game} />

        {/* Arrow Layer (pending moves) */}
        <ArrowLayer />

        {/* Unit Layer */}
        <UnitLayer game={game} />
      </Stage>
    </div>
  )
}
