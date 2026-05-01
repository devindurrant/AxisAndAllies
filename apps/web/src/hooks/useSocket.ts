import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import type { GameState, CombatRoundResult } from '../types.ts'

interface UseSocketOptions {
  gameId?: string
  onStateUpdated?: (state: GameState) => void
  onYourTurn?: () => void
  onCombatResult?: (result: CombatRoundResult) => void
}

interface UseSocketReturn {
  socket: Socket | null
  isConnected: boolean
}

export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const { gameId, onStateUpdated, onYourTurn, onCombatResult } = options
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Keep callbacks in refs so the effect doesn't need to re-run when they change
  const onStateUpdatedRef = useRef(onStateUpdated)
  const onYourTurnRef = useRef(onYourTurn)
  const onCombatResultRef = useRef(onCombatResult)

  useEffect(() => {
    onStateUpdatedRef.current = onStateUpdated
  }, [onStateUpdated])

  useEffect(() => {
    onYourTurnRef.current = onYourTurn
  }, [onYourTurn])

  useEffect(() => {
    onCombatResultRef.current = onCombatResult
  }, [onCombatResult])

  useEffect(() => {
    const socket = io({ path: '/socket.io', withCredentials: true })
    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      if (gameId) {
        socket.emit('game:join', { gameId })
      }
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    socket.on('game:state_updated', (state: GameState) => {
      onStateUpdatedRef.current?.(state)
    })

    socket.on('game:your_turn', () => {
      onYourTurnRef.current?.()
    })

    socket.on('game:combat_result', (result: CombatRoundResult) => {
      onCombatResultRef.current?.(result)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [gameId])

  return { socket: socketRef.current, isConnected }
}
