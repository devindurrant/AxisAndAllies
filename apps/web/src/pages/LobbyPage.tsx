import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listGames, createGame, joinGame } from '../api/games.ts'
import { logout } from '../api/auth.ts'
import { useAuthStore } from '../store/authStore.ts'
import { PowerName, GameStatus } from '@aa/shared'
import PowerBadge from '../components/ui/PowerBadge.tsx'
import Button from '../components/ui/Button.tsx'
import type { GameSummary } from '../types.ts'

const POWER_OPTIONS: PowerName[] = [
  PowerName.USSR,
  PowerName.GERMANY,
  PowerName.UK,
  PowerName.JAPAN,
  PowerName.USA,
]

const STATUS_LABELS: Record<GameStatus, string> = {
  [GameStatus.LOBBY]: 'Waiting',
  [GameStatus.ACTIVE]: 'In Progress',
  [GameStatus.COMPLETED]: 'Completed',
  [GameStatus.ABANDONED]: 'Abandoned',
}

export default function LobbyPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const clearUser = useAuthStore((s) => s.clearUser)

  const [newGameName, setNewGameName] = useState('')
  const [newGamePower, setNewGamePower] = useState<PowerName>(PowerName.USSR)
  const [joinPowers, setJoinPowers] = useState<Record<string, PowerName>>({})

  const { data: games = [], isLoading } = useQuery({
    queryKey: ['games'],
    queryFn: listGames,
    refetchInterval: 15_000,
  })

  const createMutation = useMutation({
    mutationFn: () => createGame(newGameName.trim(), newGamePower),
    onSuccess: (game) => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      setNewGameName('')
      navigate(`/games/${game.id}`)
    },
  })

  const joinMutation = useMutation({
    mutationFn: ({ id, power }: { id: string; power: PowerName }) => joinGame(id, power),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      navigate(`/games/${id}`)
    },
  })

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      clearUser()
      navigate('/login')
    },
  })

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!newGameName.trim()) return
    createMutation.mutate()
  }

  function handleJoin(game: GameSummary) {
    const power = joinPowers[game.id] ?? PowerName.USSR
    joinMutation.mutate({ id: game.id, power })
  }

  const myGames = games.filter((g) => g.players.some((p) => p.userId === user?.id))
  const openGames = games.filter(
    (g) =>
      g.status === GameStatus.LOBBY &&
      !g.players.some((p) => p.userId === user?.id) &&
      g.players.length < 5,
  )

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-gray-100">
      {/* Header */}
      <header className="bg-[#16213e] border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Axis &amp; Allies 1942</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">
            Signed in as <span className="text-white font-medium">{user?.username}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => logoutMutation.mutate()}>
            Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Create New Game */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Create New Game</h2>
          <form
            onSubmit={handleCreate}
            className="bg-[#16213e] rounded-xl border border-gray-700 p-6 flex flex-col sm:flex-row gap-4 items-end"
          >
            <div className="flex-1">
              <label htmlFor="game-name" className="block text-sm font-medium text-gray-300 mb-1">
                Game Name
              </label>
              <input
                id="game-name"
                type="text"
                required
                value={newGameName}
                onChange={(e) => setNewGameName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-[#0f3460] border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-usa focus:ring-1 focus:ring-usa"
                placeholder="Operation Barbarossa"
              />
            </div>
            <div>
              <label htmlFor="game-power" className="block text-sm font-medium text-gray-300 mb-1">
                Play as
              </label>
              <select
                id="game-power"
                value={newGamePower}
                onChange={(e) => setNewGamePower(e.target.value as PowerName)}
                className="px-4 py-2 rounded-lg bg-[#0f3460] border border-gray-600 text-white focus:outline-none focus:border-usa"
              >
                {POWER_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="submit"
              variant="primary"
              isLoading={createMutation.isPending}
              disabled={!newGameName.trim()}
            >
              Create Game
            </Button>
          </form>
          {createMutation.isError && (
            <p className="mt-2 text-sm text-red-400">Failed to create game. Please try again.</p>
          )}
        </section>

        {/* My Games */}
        <section>
          <h2 className="text-xl font-semibold mb-4">My Games</h2>
          {isLoading ? (
            <p className="text-gray-400">Loading games…</p>
          ) : myGames.length === 0 ? (
            <p className="text-gray-500 italic">You have no active games. Create one above!</p>
          ) : (
            <div className="space-y-3">
              {myGames.map((game) => {
                const myPlayer = game.players.find((p) => p.userId === user?.id)
                return (
                  <div
                    key={game.id}
                    className="bg-[#16213e] rounded-xl border border-gray-700 p-4 flex items-center justify-between hover:border-gray-500 transition"
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium text-white">{game.name}</p>
                        <p className="text-sm text-gray-400">
                          Round {game.round} · {STATUS_LABELS[game.status]}
                        </p>
                      </div>
                      {myPlayer && <PowerBadge power={myPlayer.power} />}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex gap-1 flex-wrap justify-end">
                        {game.players.map((p) => (
                          <PowerBadge key={p.userId} power={p.power} size="sm" />
                        ))}
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => navigate(`/games/${game.id}`)}
                      >
                        {game.status === GameStatus.LOBBY ? 'Lobby' : 'Continue'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Open Games */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Open Games</h2>
          {isLoading ? (
            <p className="text-gray-400">Loading games…</p>
          ) : openGames.length === 0 ? (
            <p className="text-gray-500 italic">No open games available right now.</p>
          ) : (
            <div className="space-y-3">
              {openGames.map((game) => {
                const takenPowers = new Set(game.players.map((p) => p.power))
                const availablePowers = POWER_OPTIONS.filter((p) => !takenPowers.has(p))
                const selectedPower = joinPowers[game.id] ?? availablePowers[0] ?? PowerName.USSR

                return (
                  <div
                    key={game.id}
                    className="bg-[#16213e] rounded-xl border border-gray-700 p-4 flex items-center justify-between hover:border-gray-500 transition"
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium text-white">{game.name}</p>
                        <p className="text-sm text-gray-400">
                          {game.players.length}/5 players · {STATUS_LABELS[game.status]}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {game.players.map((p) => (
                          <PowerBadge key={p.userId} power={p.power} size="sm" />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={selectedPower}
                        onChange={(e) =>
                          setJoinPowers((prev) => ({
                            ...prev,
                            [game.id]: e.target.value as PowerName,
                          }))
                        }
                        className="px-3 py-1.5 rounded-lg bg-[#0f3460] border border-gray-600 text-white text-sm focus:outline-none focus:border-usa"
                      >
                        {availablePowers.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleJoin(game)}
                        isLoading={
                          joinMutation.isPending && joinMutation.variables?.id === game.id
                        }
                      >
                        Join
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
